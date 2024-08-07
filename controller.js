import { config } from "dotenv";
import { OpenAI } from "openai";
import { Interview, User } from "./schema.js";
import fs from "fs";
import { logger } from "./index.js";

config();
const OPEN_AI_API_KEY = process.env.OPEN_AI_API_KEY;
const openai = new OpenAI({ apiKey: OPEN_AI_API_KEY });

export const generateQuestions = async (req, res) => {
  try {
    const { job_description, job_requirements, interview_level, email } =
      req.body;

    if (!job_description || !job_requirements || !interview_level || !email) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `
          Generate 10 interview questions related to the job description which is ${job_description} 
          and job requirement are ${job_requirements} of ${interview_level} difficulty to prepare a 
          candidate for an interview in the field of Computer Science.Keep the questions at 0 and 9 
          index about personal background to judge candidate personality and at other indices keep 
          technical knowledge questions.

          Example : 
          Job Description : Software Development Engineer
          Job Requirements : Proficiency in at least one programming language (e.g., Python, JavaScript, Java)
          Interview Level : Hard
           
          Response : 
          "questions": [
            {
              "question": "Tell me about a challenging software development project you worked on using Python. What was your role and the outcome?"
            },
            {
              "question": "Explain the difference between Agile and Scrum methodologies. When would you use one over the other?"
            },
            {
              "question": "How do you approach solving complex problems during software development? Can you provide an example?"
            },
            {
              "question": "Describe a situation where you had to work independently on a project. How did you ensure its success?"
            },
            {
              "question": "In your opinion, what is the importance of communication in a team environment during software development?"
            },
            {
              "question": "What programming language do you feel most comfortable with and why? Can you give an example of a project you completed using that language?"
            },
            {
              "question": "How do you ensure that your code meets quality standards and is maintainable in the long run?"
            },
            {
              "question": "Have you ever faced a situation where there was a disagreement within your team regarding a technical decision? How did you handle it?"
            },
            {
              "question": "Can you walk me through your experience working on a software project that required a high level of collaboration with team members? What was your role?"
            },
            {
              "question": "Tell me about a time when you had to quickly learn a new programming language or technology. How did you approach the learning process?"
            }
          ]

          .JSON format is preferred.
          `,
        },
        {
          role: "user",
          content: `What are questions related to the job description and job requirements`,
        },
      ],
      max_tokens: 2000,
      temperature: 0.7,
    });

    if (response.choices[0].message.content) {
      try {
        const questionsObject = JSON.parse(response.choices[0].message.content);
        if (!questionsObject.questions) {
          logger.error(
            "Failed to parse response from OpenAI: No 'questions' property found"
          );
          return res
            .status(500)
            .json({ error: "Failed to parse response from OpenAI" });
        }

        let qa = [];
        questionsObject.questions.forEach((question, index) => {
          qa.push({
            Question: question.question,
            Answer: "",
            Type: index === 0 || index === 9 ? "Background" : "Technical",
            Score: 0,
          });
        });

        const interview_id = Math.random().toString(36).substr(2, 9);

        await Interview.create({
          InterviewId: interview_id,
          Email: email,
          Job_Description: job_description,
          Job_Requirments: job_requirements,
          Date: new Date().toLocaleDateString(),
          Time: new Date().toLocaleTimeString(),
          QA: qa,
          TotalScore: 0,
        });

        logger.info("Questions generated successfully");
        res.status(200).json({ questions: qa, interview_id: interview_id });
      } catch (error) {
        console.error("Error parsing questions:", error.message);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    } else {
      console.error("OpenAI response data is undefined");
      res
        .status(500)
        .json({ error: "Failed to retrieve response from OpenAI" });
    }
  } catch (error) {
    console.error("Error generating questions:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const createUser = async (req, res) => {
  try {
    let { Name, Age, Phone, Email, ResumeImage } = req.body;

    Name = Name.trim();
    Email = Email.trim();

    if (!Name || !Age || !Phone || !Email || !ResumeImage) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (typeof Age !== "number" || Age <= 0) {
      return res.status(400).json({ error: "Age must be a positive number" });
    }

    if (typeof Phone !== "string" || !/^\d{10}$/.test(Phone)) {
      return res
        .status(400)
        .json({ error: "Phone number must be a 10-digit string" });
    }

    const existingEmailUser = await User.findOne({ Email });
    if (existingEmailUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const existingPhoneUser = await User.findOne({ Phone });
    if (existingPhoneUser) {
      return res.status(400).json({ error: "Phone number already exists" });
    }

    const user = new User({
      Name,
      Age,
      Phone,
      Email,
      ResumeImage,
      Badge: "Newbie",
      Badge_Score: 0,
      Badges_Url: [
        "https://d8it4huxumps7.cloudfront.net/uploads/images/gamify_badges/login_streak/1.png?d=140x140",
      ],
    });

    await user.save();
    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    console.error("Error creating user:", error.message);
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ error: errors.join(", ") });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getInterviews = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    //sort by date
    const interviews = await Interview.find({ Email: email }).sort({
      Date: -1,
    });
    res.status(200).json({ interviews });
  } catch (error) {
    console.error("Error getting interviews:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const suggestedAnswer = async (req, res) => {
  try {
    const { interview_id, email, question_index } = req.body;
    const interview = await Interview.findOne({ InterviewId: interview_id });

    if (!interview) {
      return res.status(404).json({ error: "Interview not found" });
    }

    if (interview.Email !== email) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    let question = interview.QA[question_index];

    const suggestedAnswerPrompt = `Suggest an answer to the following question: "${question}". 
    Suggest a detailed and relevant answer that would be appropriate for a ${interview.Job_Description} 
    interview having following requiremnets ${interview.Job_Requirments}. Consider yourself an expert 
    in the field and provide a detailed answer that would be helpful to the candidate.
    Avoid open-ended answers and provide a clear and concise response.

    Example Question: 
    "Tell me about a challenging software development project you worked on using Python.
    What was your role and the outcome?"

    Response:
    {
      "suggested_answer" : "I worked on a challenging software development project using Python where I was responsible for 
      design and implement the backend architecture using Django and PostgreSQL. The outcome was a highly 
      scalable and performant application that processed data 10x faster than the previous system."
      developing a web application that could process large amounts of data in real-time. My role was to
      design and implement the backend architecture using Django and PostgreSQL. The outcome was a highly
      scalable and performant application that processed data 10x faster than the previous system."
    }

    AVOID ANY TRAILING COMMAS
    Answer should be in JSON format.`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: suggestedAnswerPrompt,
        },
        {
          role: "user",
          content: "Suggest an answer",
        },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    if (response.choices[0].message.content) {
      const suggestedAnswer = JSON.parse(response.choices[0].message.content);
      res.status(200).json({ suggested_answer:suggestedAnswer.suggested_answer });
    }else{
      console.error("OpenAI response data is undefined");
      res
        .status(500)
        .json({ error: "Failed to retrieve response from OpenAI" });
    }
  } catch (error) {
    console.error("Error getting suggested answer:", error.message);
    logger.error("Error getting suggested answer");
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const submitAnswer = async (req, res) => {
  try {
    const { interview_id, email, question_index, answer, difficulty_level } =
      req.body;
    const interview = await Interview.findOne({ InterviewId: interview_id });
    if (!interview) {
      return res.status(404).json({ error: "Interview not found" });
    }
    if (interview.Email !== email) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    let question = interview.QA[question_index];

    const scorePrompt = ` Evaluate the candidate's answer "${answer}" to the following question: "${question.Question}".
    On a scale of 1 to 10, rate the quality of the answer provided by considering factors such as:
    - Clarity
    - Depth of understanding
    - Relevance to the question
    - Problem-solving approach
    
    Please provide a cumulative score only that reflects the overall effectiveness of the response.
    Remember that this is a ${difficulty_level} level interview, and you are simulating a real interviewer.
    The score should accurately reflect the candidate's performance and contribute to a fair assessment of their abilities.
    JSON format is preferred.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: scorePrompt,
        },
        {
          role: "user",
          content: `Score for the answer ${answer}`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    if (response.choices[0].message.content) {
      const scoreObject = JSON.parse(response.choices[0].message.content);
      const score = scoreObject.score;
      if (isNaN(score) || score < 1 || score > 10) {
        return res.status(400).json({ error: "Invalid score" });
      }
      question.Answer = answer;
      question.Score = score;

      let sumOfScores = 0;
      interview.QA.forEach((qa) => {
        sumOfScores += qa.Score;
      });

      let totalScore = sumOfScores / 10;
      interview.TotalScore = totalScore;

      await interview.save();

      const allInterviews = await Interview.find({ Email: email });

      let totalScoreOfAllInterviews = 0;

      allInterviews.forEach((interview) => {
        totalScoreOfAllInterviews += interview.TotalScore;
      });

      const averageScore = totalScoreOfAllInterviews / allInterviews.length;
      let badge = "";
      const user = await User.findOne({ Email: email });

      // Score 0-3: Newbie
      // Score 4-6: Intermediate
      // Score 7-9: Advanced
      // Score 10: Expert

      let badge_url = "";
      if (averageScore >= 0 && averageScore <= 3) {
        badge = "Newbie";
      } else if (averageScore > 3 && averageScore <= 6) {
        badge = "Intermediate";
        badge_url =
          "https://d8it4huxumps7.cloudfront.net/uploads/images/gamify_badges/login_streak/2.png?d=140x140";
        user.Badges_Url.push(badge_url);
      } else if (averageScore > 6 && averageScore <= 9) {
        badge = "Advanced";
        badge_url =
          "https://d8it4huxumps7.cloudfront.net/uploads/images/gamify_badges/login_streak/3.png?d=140x140";
        user.Badges_Url.push(badge_url);
      } else {
        badge = "Expert";
        badge_url =
          "https://d8it4huxumps7.cloudfront.net/uploads/images/gamify_badges/login_streak/4.png?d=140x140";
        user.Badges_Url.push(badge_url);
      }

      user.Badge = badge;
      user.Badge_Score = averageScore;
      await user.save();

      res
        .status(200)
        .json({ message: "Answer submitted successfully", score: score });
    } else {
      console.error("OpenAI response data is undefined");
      res
        .status(500)
        .json({ error: "Failed to retrieve response from OpenAI" });
    }
  } catch (error) {
    console.error("Error submitting answer:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const totalScore = async (req, res) => {
  try {
    const { interview_id, email } = req.body;
    const interview = await Interview.findOne({ InterviewId: interview_id });
    if (!interview) {
      return res.status(404).json({ error: "Interview not found" });
    }
    if (interview.Email !== email) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const totalScore = interview.TotalScore;

    res
      .status(200)
      .json({ message: "Total score calculated successfully", totalScore });
  } catch (error) {
    console.error("Error calculating total score:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const stats = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    const interviews = await Interview.find({ Email: email });

    const total_interviews = interviews.length;

    const questions_answered = interviews.reduce((acc, curr) => {
      return acc + curr.QA.filter((qa) => qa.Answer).length;
    }, 0);

    const all_answers = interviews.reduce((acc, curr) => {
      return acc.concat(
        curr.QA.filter((qa) => qa.Answer).map((qa) => qa.Answer)
      );
    }, []);

    const all_questions = interviews.reduce((acc, curr) => {
      return acc.concat(curr.QA.map((qa) => qa.Question));
    }, []);

    const available_answered_questions_pair = interviews.reduce((acc, curr) => {
      return acc.concat(
        curr.QA.filter((qa) => qa.Answer).map((qa) => {
          return { Question: qa.Question, Answer: qa.Answer };
        })
      );
    }, []);

    const user = await User.findOne({ Email: email });

    const badge = user.Badge;
    const badge_score = user.Badge_Score;
    const badge_url = user.Badges_Url;
    const total_badges = user.Badges_Url.length;

    res.status(200).json({
      total_interviews,
      questions_answered,
      all_answers,
      all_questions,
      available_answered_questions_pair,
      badge,
      badge_score,
      badge_url,
      total_badges,
    });
  } catch (error) {
    console.error("Error calculating stats:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getUsers = async (req, res) => {
  try {
    const users = await User.find();
    res.status(200).json({ users });
  } catch (error) {
    console.error("Error getting users:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const badge = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    const user = await User.findOne({ Email: email });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({
      badge: user.Badge,
      badge_score: user.Badge_Score,
      badges_url: user.Badges_Url,
      latest_badge_url: user.Badges_Url[user.Badges_Url.length - 1],
      total_badges: user.Badges_Url.length,
    });
  } catch (error) {
    console.error("Error getting badge:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
