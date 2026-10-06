-- QuizArena now has exactly two themes: BLACK (black + orange) and WHITE (white + blue).
-- The retired dark BLUE theme becomes BLACK, in quizzes and in organisers' defaults.
-- (Reads map it too, so this only tidies stored data; it is safe to run more than once.)
UPDATE "Quiz"
SET "appearance" = jsonb_set("appearance"::jsonb, '{theme}', '"BLACK"')
WHERE "appearance" IS NOT NULL AND "appearance"::jsonb ->> 'theme' = 'BLUE';

UPDATE "User"
SET "preferences" = jsonb_set("preferences"::jsonb, '{appearance,theme}', '"BLACK"')
WHERE "preferences"::jsonb #>> '{appearance,theme}' = 'BLUE';
