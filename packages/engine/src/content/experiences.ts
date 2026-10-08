import type {
  BreakActivity,
  CuriosityActivity,
  ExplanationActivity,
  ExplanationBody,
  MissionActivity,
  ReflectionActivity,
} from "../types";

/**
 * Explanations in five modalities, curiosity paths, peer missions, reflections and breaks.
 * Every explanation carries a text fallback so LIGHT mode and screen readers get the same idea.
 */

function explanation(
  id: string,
  conceptId: ExplanationActivity["conceptId"],
  title: string,
  body: ExplanationBody,
  takeaway: string,
): ExplanationActivity {
  return {
    id,
    type: "explanation",
    title,
    conceptId,
    modality: body.modality,
    body,
    takeaway,
    textFallback: toText(body, takeaway),
  };
}

function toText(body: ExplanationBody, takeaway: string): string {
  switch (body.modality) {
    case "text":
    case "analogy":
    case "visual":
      return [...body.paragraphs, takeaway].join("\n\n");
    case "worked":
      return [
        body.problem,
        ...body.steps.map((s, i) => `${i + 1}. ${s.label}: ${s.work}`),
        takeaway,
      ].join("\n");
    case "dialogue":
      return [
        ...body.lines.map((l) => `${l.speaker === "you" ? "You" : "Guide"}: ${l.text}`),
        takeaway,
      ].join("\n");
  }
}

export const EXPLANATIONS: ExplanationActivity[] = [
  /* Logarithms — the assignment concept, in all five modalities. */
  explanation(
    "ex-logs-text",
    "logs",
    "What a logarithm counts",
    {
      modality: "text",
      paragraphs: [
        "A logarithm answers one question: how many times do I multiply? log₂ 8 asks how many 2s multiply to make 8. Since 2 × 2 × 2 = 8, log₂ 8 = 3.",
        "Exponents go forward: 2³ = 8 means multiply three times and you get 8. Logs go backward: log₂ 8 = 3 means you got 8, so how many multiplications was that?",
        "When the answer isn't a whole number, the log still works. log₂ 40 ≈ 5.32, because 40 sits between 2⁵ = 32 and 2⁶ = 64.",
      ],
    },
    "A log counts multiplications.",
  ),
  explanation(
    "ex-logs-visual",
    "logs",
    "The doubling ladder",
    {
      modality: "visual",
      visual: "doubling-ladder",
      caption: "Each rung doubles. The log is the rung number.",
      paragraphs: [
        "Climb the ladder: every rung multiplies by 2. To reach 64 you climb 6 rungs, so log₂ 64 = 6.",
        "Pick a number between two rungs and the log becomes a fraction of a rung: 40 is about 5.3 rungs up.",
      ],
    },
    "log₂ n = how many rungs of doubling it takes to reach n.",
  ),
  explanation(
    "ex-logs-analogy",
    "logs",
    "Logs are folding paper",
    {
      modality: "analogy",
      paragraphs: [
        "Fold a sheet of paper in half and it's 2 layers thick. Fold again: 4. Again: 8. If someone hands you a folded stack 32 layers thick and asks how many folds that took, you're computing log₂ 32 = 5.",
        "Exponents ask: after this many folds, how thick? Logs ask: to get this thick, how many folds? It's the same relationship, run in the opposite direction.",
        "That's why logs show up wherever something grows by multiplying, like bank balances, populations and followers. They tell you how long it takes.",
      ],
    },
    "Exponent: folds → thickness. Logarithm: thickness → folds.",
  ),
  explanation(
    "ex-logs-worked",
    "logs",
    "Solving an exponential equation",
    {
      modality: "worked",
      problem: "Solve 5ˣ = 200, to 2 decimal places.",
      steps: [
        { label: "Take the log of both sides", work: "log(5ˣ) = log 200" },
        { label: "Bring the power down", work: "x · log 5 = log 200" },
        { label: "Divide", work: "x = log 200 ÷ log 5 = 2.301 ÷ 0.699" },
        {
          label: "Compute and sanity-check",
          work: "x ≈ 3.29. Check: 5³ = 125 and 5⁴ = 625, so x should be between 3 and 4. ✓",
        },
      ],
    },
    "When the unknown is in the exponent, logs bring it down to earth.",
  ),
  explanation(
    "ex-logs-dialogue",
    "logs",
    "Logs in a minute",
    {
      modality: "dialogue",
      lines: [
        { speaker: "guide", text: "Quick one: 2 × 2 × 2 = ?" },
        { speaker: "you", text: "8." },
        { speaker: "guide", text: "Now flip it. I give you 8. How many 2s did I multiply?" },
        { speaker: "you", text: "Three." },
        { speaker: "guide", text: "You just did a logarithm. log₂ 8 = 3." },
        { speaker: "you", text: "That's it?" },
        { speaker: "guide", text: "That's it. A log counts multiplications. What's log₂ 32?" },
        { speaker: "you", text: "2, 4, 8, 16, 32… five." },
        { speaker: "guide", text: "Exactly. And log₁₀ 1000?" },
        { speaker: "you", text: "10 × 10 × 10. Three." },
      ],
    },
    "A log counts multiplications. You already knew how to do it.",
  ),

  /* Percentage growth */
  explanation(
    "ex-percent-text",
    "percent",
    "Growing by a percentage means multiplying",
    {
      modality: "text",
      paragraphs: [
        "Growing by 10% means multiplying by 1.1: the original 100%, plus 10% more.",
        "Do it again and the next 10% is taken from the bigger number. ₹1,000 → ₹1,100 → ₹1,210. The extra ₹10 in year two is interest earning interest.",
        "So r% growth for n periods means multiplying by (1 + r/100)ⁿ. That's compounding.",
      ],
    },
    "Percentage growth = repeated multiplication by (1 + r/100).",
  ),
  explanation(
    "ex-percent-visual",
    "percent",
    "Simple vs compound, year by year",
    {
      modality: "visual",
      visual: "compound-bars",
      caption: "Simple interest adds the same amount; compound interest multiplies.",
      paragraphs: [
        "Each pair of bars is a year. The gap between simple and compound starts tiny, then runs away.",
        "Slide the rate up: at higher rates the gap opens sooner.",
      ],
    },
    "Compounding is slow, then sudden.",
  ),
  explanation(
    "ex-percent-analogy",
    "percent",
    "The snowball",
    {
      modality: "analogy",
      paragraphs: [
        "A snowball rolling downhill picks up snow in proportion to its size. A bigger snowball has more surface, so it picks up more on the next roll.",
        "Compound growth works the same way. Each period's growth is a percentage of what you already have, so the growth itself grows.",
        "Simple interest is a snowball that only ever picks up the same handful: steady, but it never runs away.",
      ],
    },
    "Compound growth grows on its own growth.",
  ),
  explanation(
    "ex-percent-worked",
    "percent",
    "Compounding, worked",
    {
      modality: "worked",
      problem: "₹5,000 at 8% a year, compounded yearly. What's it worth after 3 years?",
      steps: [
        { label: "Write the multiplier", work: "8% growth → × 1.08" },
        { label: "Apply it three times", work: "5000 × 1.08³" },
        { label: "Compute 1.08³", work: "1.08 × 1.08 = 1.1664, then × 1.08 = 1.2597" },
        { label: "Finish", work: "5000 × 1.2597 ≈ ₹6,299 (simple interest would give ₹6,200)" },
      ],
    },
    "Find the multiplier, raise it to the number of periods, multiply.",
  ),

  /* Doubling */
  explanation(
    "ex-doubling-text",
    "doubling",
    "Exponential means repeated multiplication",
    {
      modality: "text",
      paragraphs: [
        "Linear growth adds the same amount each step: 3, 6, 9, 12. Exponential growth multiplies by the same amount: 3, 6, 12, 24.",
        "2⁵ means five 2s multiplied: 2 × 2 × 2 × 2 × 2 = 32. The small number up top counts the multiplications.",
        "Early on the two look alike. Then multiplication runs away: after 20 steps, adding 3 each time reaches 63, while doubling from 3 passes 3 million.",
      ],
    },
    "Adding gives a line. Multiplying gives a curve that takes off.",
  ),
  explanation(
    "ex-doubling-visual",
    "doubling",
    "Adding vs multiplying",
    {
      modality: "visual",
      visual: "growth-compare",
      caption: "Same start, very different futures.",
      paragraphs: [
        "The straight line adds the same amount every step. The curve multiplies.",
        "Drag the steps: for a while the line is ahead, then the curve passes it and never looks back.",
      ],
    },
    "Exponential growth always overtakes linear growth eventually.",
  ),
  explanation(
    "ex-doubling-analogy",
    "doubling",
    "How a secret spreads",
    {
      modality: "analogy",
      paragraphs: [
        "You tell 2 friends a secret. Each of them tells 2 more. Then those 4 tell 2 each. After 5 rounds, 32 people know: 2⁵.",
        "Nobody did anything unusual. Each person only told two others. That's exponential growth: a small multiplication, repeated.",
      ],
    },
    "Small multiplications, repeated, get huge.",
  ),

  /* Doubling time */
  explanation(
    "ex-doubling-time-text",
    "doubling_time",
    "The rule of 70",
    {
      modality: "text",
      paragraphs: [
        "If something grows at r% per period, it doubles in roughly 70 ÷ r periods.",
        "7% a year doubles in about 10 years. 10% a year doubles in about 7.",
        "Why 70? Because ln 2 ≈ 0.693. For small rates, doubling time ≈ 0.693 ÷ (r/100) ≈ 70 ÷ r.",
      ],
    },
    "Doubling time ≈ 70 ÷ growth rate (%).",
  ),
  explanation(
    "ex-doubling-time-analogy",
    "doubling_time",
    "The lily pond",
    {
      modality: "analogy",
      paragraphs: [
        "Lily pads that double daily cover a pond on day 30. On day 29 it's half covered. On day 25 it's about 3% covered: you'd barely notice.",
        "That's what doubling time feels like. For a long time nothing seems to happen, then everything happens at once.",
      ],
    },
    "With doubling, the last few steps do most of the work.",
  ),
  explanation(
    "ex-doubling-time-worked",
    "doubling_time",
    "Counting doublings",
    {
      modality: "worked",
      problem: "A city of 2 lakh grows 5% a year. When does it reach 8 lakh?",
      steps: [
        { label: "How many doublings?", work: "2 → 4 → 8 lakh: two doublings" },
        { label: "Doubling time (rule of 70)", work: "70 ÷ 5 = 14 years" },
        { label: "Total", work: "2 × 14 = 28 years" },
        { label: "Exact check", work: "n = ln 4 ÷ ln 1.05 ≈ 28.4 years ✓" },
      ],
    },
    "Count the doublings, then multiply by the doubling time.",
  ),

  /* Modelling */
  explanation(
    "ex-modelling-text",
    "modelling",
    "Two points make a forecast",
    {
      modality: "text",
      paragraphs: [
        "Two data points are enough to fit an exponential: find the growth factor per period, then project forward.",
        "If a quantity goes from A to B over n periods, the factor per period is (B ÷ A)^(1/n).",
        "Logs then answer 'when?'. To reach C, solve A × factorᵗ = C, so t = log(C ÷ A) ÷ log(factor).",
      ],
    },
    "Factor from two points; timing from logs.",
  ),
  explanation(
    "ex-modelling-worked",
    "modelling",
    "Forecasting an app's users",
    {
      modality: "worked",
      problem: "An app grows from 2M users (January) to 3.2M (July). When does it reach 10M?",
      steps: [
        { label: "Growth over 6 months", work: "3.2 ÷ 2 = 1.6" },
        { label: "Monthly factor", work: "1.6^(1/6) ≈ 1.081" },
        { label: "Multiplier needed", work: "10 ÷ 2 = 5" },
        { label: "Solve with logs", work: "t = ln 5 ÷ ln 1.081 ≈ 20.6 months after January" },
      ],
    },
    "Around September next year, if the growth holds (it rarely holds forever).",
  ),
];

export const CURIOSITY_PATHS: CuriosityActivity[] = [
  {
    id: "cp-paper-moon",
    type: "curiosity",
    title: "Folding paper to the Moon",
    conceptId: "logs",
    frame: "space",
    hook: "How thick is a piece of paper folded 42 times?",
    startNodeId: "start",
    nodes: [
      {
        id: "start",
        title: "Make a guess",
        body: "A sheet of paper is 0.1 mm thick. Every fold doubles it. Fold it 42 times (in theory). How thick is the stack?",
        check: {
          prompt: "Your guess:",
          options: ["A thick book", "A tall building", "Mount Everest", "Past the Moon"],
          answerIndex: 3,
          explanation:
            "About 440,000 km, past the Moon (384,400 km away). 0.1 mm × 2⁴² ≈ 4.4 × 10¹¹ mm. Most people guess a building. Doubling defeats intuition.",
        },
        next: [
          { nodeId: "limit", label: "Then why can't I fold paper more than about 7 times?" },
          { nodeId: "rice", label: "Does anything real grow like this?" },
          { nodeId: "count", label: "How would I even work out '42'?" },
        ],
      },
      {
        id: "limit",
        title: "The fold limit",
        body: "In 2002, a student named Britney Gallivan folded paper in half 12 times, using a very long strip of thin paper (over a kilometre). She worked out that the length you need grows exponentially with each fold, so every extra fold costs far more paper than the one before.",
        next: [
          { nodeId: "count", label: "So how do you count folds mathematically?" },
          { nodeId: "rice", label: "Show me another one" },
        ],
      },
      {
        id: "rice",
        title: "Rice on a chessboard",
        body: "Put 1 grain of rice on the first square of a chessboard, 2 on the next, 4 on the next, doubling each time. The last square alone needs 2⁶³ grains, over 9 quintillion. The whole board would take hundreds of years of the world's entire rice harvest.",
        check: {
          prompt: "Square 64 holds 2⁶³ grains. Roughly how many digits is that number? (2¹⁰ ≈ 10³)",
          options: ["10", "19", "63", "64"],
          answerIndex: 1,
          hint: "63 doublings ≈ 6.3 groups of ten doublings, each ≈ ×1,000.",
          explanation:
            "log₁₀(2⁶³) = 63 × 0.301 ≈ 18.96, so 19 digits. You just used a logarithm to count digits.",
        },
        next: [{ nodeId: "count", label: "Wait, that was a logarithm?" }],
      },
      {
        id: "count",
        title: "Counting doublings is a logarithm",
        returnsToSyllabus: true,
        body: "To reach the Moon you need 0.1 mm × 2ⁿ ≥ 384,400 km. In tenths of a millimetre that's 2ⁿ ≥ 3.84 × 10¹², so n = log₂(3.84 × 10¹²) ≈ 41.8: 42 folds. That's your assignment. Logs answer 'how many doublings?'.",
        check: {
          prompt: "Using 2¹⁰ ≈ 10³, roughly how many doublings make a trillion (10¹²)?",
          options: ["12", "40", "120", "1,000"],
          answerIndex: 1,
          hint: "Each 10 doublings ≈ ×1,000 = 10³. How many lots of 10³ make 10¹²?",
          explanation: "10¹² = (10³)⁴ ≈ (2¹⁰)⁴ = 2⁴⁰. About 40 doublings, so log₂(10¹²) ≈ 40.",
        },
        next: [],
      },
    ],
  },
  {
    id: "cp-loudness",
    type: "curiosity",
    title: "Why loudness is logarithmic",
    conceptId: "logs",
    frame: "music",
    hook: "Your earphones at full volume versus a whisper: how many times more intense?",
    startNodeId: "start",
    nodes: [
      {
        id: "start",
        title: "Make a guess",
        body: "A whisper is about 30 decibels. Earphones at full volume can reach around 100 dB. How many times more intense is the sound?",
        check: {
          prompt: "Your guess:",
          options: ["About 3×", "About 70×", "About 10,000×", "About 10,000,000×"],
          answerIndex: 3,
          explanation:
            "Decibels are logarithmic: every +10 dB is 10× the intensity. +70 dB is 10⁷: ten million times.",
        },
        next: [
          { nodeId: "why", label: "Why would anyone measure sound like that?" },
          { nodeId: "back", label: "How does this connect to logs?" },
        ],
      },
      {
        id: "why",
        title: "Ears hear ratios",
        body: "Your ears respond to ratios, not differences. Going from 1 to 2 violins sounds like a big jump; going from 50 to 51 barely registers. A logarithmic scale turns those ratios into even steps, which matches how loudness feels.",
        next: [{ nodeId: "back", label: "Show me the maths" }],
      },
      {
        id: "back",
        title: "Decibels are logs",
        returnsToSyllabus: true,
        body: "Sound level in dB = 10 × log₁₀(I ÷ I₀). Each factor of 10 in intensity adds 1 to the log, and 10 to the decibels. Earthquake magnitudes and pH work the same way.",
        check: {
          prompt: "A sound goes from 60 dB to 90 dB. How many times more intense is it?",
          options: ["1.5×", "30×", "300×", "1,000×"],
          answerIndex: 3,
          hint: "+30 dB is three steps of +10 dB.",
          explanation: "Three steps of ×10: 10³ = 1,000 times more intense.",
        },
        next: [],
      },
    ],
  },
];

export const MISSIONS: MissionActivity[] = [
  {
    id: "mission-viral",
    type: "mission",
    title: "Mission: will the club page hit 2,000?",
    conceptId: "percent",
    difficulty: 3,
    brief:
      "Your school's music club page has 800 followers and grows 9% a week. The fest is in 12 weeks. The club wants 2,000 followers by then. Three of you split the work.",
    peers: [
      {
        name: "Riya",
        interest: "music",
        role: "Growth factor",
        contribution: "9% a week means multiplying by 1.09 every week.",
      },
      {
        name: "Dev",
        interest: "cricket",
        role: "Sanity check",
        contribution:
          "Rule of 70: 70 ÷ 9 ≈ 7.8 weeks to double, so 12 weeks is a bit more than one doubling.",
      },
    ],
    yourPart: {
      prompt: "Your part: followers after 12 weeks, 800 × 1.09¹² ≈ ?",
      options: ["≈ 1,660", "≈ 2,250", "≈ 1,860", "≈ 9,600"],
      answerIndex: 1,
      hint: "1.09¹² ≈ 2.81. Dev's check says it should be a bit more than double.",
      explanation: "1.09¹² ≈ 2.813, so 800 × 2.813 ≈ 2,250. The club makes it.",
    },
    teachBack: {
      prompt:
        "Riya worked out 800 + 12 × 72 = 1,664 and thinks they'll miss. Which explanation helps her most?",
      options: [
        "Each week's 9% is taken from a bigger number, so growth speeds up",
        "9% was rounded, so the answer is off",
        "Some followers will leave",
      ],
      answerIndex: 0,
      explanation:
        "Adding 72 a week is simple growth. Compounding takes 9% of the new, bigger total each week.",
    },
    verdict: "≈ 2,250 followers by the fest. Target hit, with room to spare.",
  },
  {
    id: "mission-offer",
    type: "mission",
    title: "Mission: pick the better offer",
    conceptId: "percent",
    difficulty: 4,
    brief:
      "A relative offers ₹10,000 now in one of two ways, locked for 10 years. Offer A adds ₹1,000 every year (simple). Offer B grows 8% a year, compounded. Three of you decide.",
    peers: [
      {
        name: "Arjun",
        interest: "startups",
        role: "Offer A",
        contribution: "Offer A: 10,000 + 10 × 1,000 = ₹20,000 after 10 years.",
      },
      {
        name: "Sana",
        interest: "space",
        role: "Rule of 70",
        contribution:
          "70 ÷ 8 ≈ 8.75 years to double, so B should pass ₹20,000 just before year 10.",
      },
    ],
    yourPart: {
      prompt: "Your part: Offer B after 10 years, 10,000 × 1.08¹⁰ ≈ ?",
      options: ["₹18,000", "₹21,600", "₹20,000", "₹28,000"],
      answerIndex: 1,
      hint: "1.08¹⁰ ≈ 2.16.",
      explanation: "1.08¹⁰ ≈ 2.159, so ≈ ₹21,589. Offer B wins by about ₹1,600.",
    },
    teachBack: {
      prompt:
        "Arjun asks why B wins when 8% of 10,000 is only ₹800, less than A's ₹1,000. Best reply?",
      options: [
        "Because B's 8% is taken from a growing total; by the later years it's well over ₹1,000 a year",
        "Because 8% is bigger than ₹1,000",
        "B doesn't really win; it's a rounding error",
      ],
      answerIndex: 0,
      explanation: "B's yearly gain starts at ₹800 but passes ₹1,000 by year 4 and keeps climbing.",
    },
    verdict: "Offer B: ≈ ₹21,600 against ₹20,000. Compounding wins over a long enough time.",
  },
];

export const REFLECTIONS: ReflectionActivity[] = [
  {
    id: "rf-logs",
    type: "reflection",
    title: "Lock it in",
    conceptId: "logs",
    prompt: "In one line, as if to a friend: what does a logarithm actually count?",
    placeholder: "A log counts…",
  },
  {
    id: "rf-percent",
    type: "reflection",
    title: "Lock it in",
    conceptId: "percent",
    prompt: "In one line: why does compound growth beat simple growth over time?",
    placeholder: "Because…",
  },
  {
    id: "rf-general",
    type: "reflection",
    title: "Lock it in",
    conceptId: "doubling",
    prompt: "What's one thing that clicked today, and one thing that's still fuzzy?",
    placeholder: "Clicked: … Fuzzy: …",
  },
];

export const BREAKS: BreakActivity[] = [
  {
    id: "br-reset",
    type: "break",
    title: "Two-minute reset",
    conceptId: "doubling",
    minutes: 2,
    stopHere: false,
    body: "Step away from the screen. Your place is saved, and nothing is lost by pausing.",
    suggestions: [
      "Stand up and stretch your arms over your head",
      "Drink some water",
      "Look at something far away for 20 seconds",
    ],
  },
  {
    id: "br-stop",
    type: "break",
    title: "This is a good place to stop",
    conceptId: "doubling",
    minutes: 0,
    stopHere: true,
    body: "You've done real work, and pushing on tired tends to undo it. Stopping now, on something that went well, makes it easier to start next time.",
    suggestions: [
      "Your progress is saved on this device",
      "Next time we'll pick up exactly where this left off",
    ],
  },
];
