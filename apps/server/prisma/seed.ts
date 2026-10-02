import "dotenv/config";
import { hashPassword } from "../src/lib/auth";
import { createDb } from "../src/db";

/**
 * Creates the first admin account (from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD) and a sample
 * published quiz so a fresh install can go live in under a minute. Safe to re-run.
 */
const SAMPLE: {
  text: string;
  type?: "TRUE_FALSE";
  options: string[];
  correct: number;
  time?: number;
  explanation?: string;
}[] = [
  {
    text: "Which data structure gives O(1) average lookup by key?",
    options: ["Linked list", "Hash table", "Binary heap", "Stack"],
    correct: 1,
    explanation: "Hash tables map keys to buckets directly; collisions are rare on average.",
  },
  {
    text: "HTTP status 404 means the server could not find the requested resource.",
    type: "TRUE_FALSE",
    options: ["True", "False"],
    correct: 0,
    time: 10,
  },
  {
    text: "What does the 'S' in HTTPS stand for?",
    options: ["Server", "Secure", "Socket", "Session"],
    correct: 1,
    time: 15,
  },
  {
    text: "Which sorting algorithm has the best worst-case time complexity?",
    options: ["Quick sort", "Bubble sort", "Merge sort", "Insertion sort"],
    correct: 2,
    explanation: "Merge sort is O(n log n) in every case; quick sort degrades to O(n²).",
  },
  {
    text: "Git was originally written by Linus Torvalds.",
    type: "TRUE_FALSE",
    options: ["True", "False"],
    correct: 0,
    time: 10,
  },
  {
    text: "Which protocol keeps a full-duplex connection open between browser and server?",
    options: ["FTP", "SMTP", "WebSocket", "DNS"],
    correct: 2,
  },
  {
    text: "In binary, what is 1010 + 0110?",
    options: ["10000", "1111", "10010", "1100"],
    correct: 0,
    time: 30,
    explanation: "10 + 6 = 16, which is 10000 in binary.",
  },
  {
    text: "Which company created the TypeScript language?",
    options: ["Google", "Meta", "Microsoft", "Mozilla"],
    correct: 2,
    time: 15,
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!url) throw new Error("DATABASE_URL is required");
  if (!email || !password) throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required");
  if (password.length < 10) throw new Error("SEED_ADMIN_PASSWORD must be at least 10 characters");

  const db = createDb(url);
  const admin = await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: process.env.SEED_ADMIN_NAME ?? "Arena Admin",
      passwordHash: await hashPassword(password),
    },
  });

  const title = "CS Showdown: Warm-up Round";
  const existing = await db.quiz.findFirst({ where: { ownerId: admin.id, title } });
  if (!existing) {
    await db.quiz.create({
      data: {
        ownerId: admin.id,
        title,
        description:
          "A fast eight-question opener for tech events. Mixed difficulty, two true/false breathers.",
        status: "PUBLISHED",
        defaultTimerSec: 20,
        questions: {
          create: SAMPLE.map((q, order) => ({
            order,
            type: q.type ?? "MULTIPLE_CHOICE",
            text: q.text,
            timeLimitSec: q.time ?? null,
            explanation: q.explanation ?? "",
            options: {
              create: q.options.map((text, i) => ({ order: i, text, isCorrect: i === q.correct })),
            },
          })),
        },
      },
    });
  }

  console.log(`Seeded admin ${email}${existing ? "" : " and sample quiz"}.`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
