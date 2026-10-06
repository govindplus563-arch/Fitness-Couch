// Run plan generator + exercise content.
import { S, mondayOf, pdate, dstr, daysBetween, addDays } from './store.js';

// ---------- Run plan ----------
// Mon, Wed, Fri, Sat are run days. Tue, Thu, Sun are run-rest days (strength / abs / yoga).
// Weekdays use JS numbering: 0=Sun … 6=Sat.
export const RUN_DAYS = [1, 3, 5, 6];
export const WORKOUT_DAYS = [2, 4, 0];
export const WORKOUT_FOR_DAY = { 2: 'A', 4: 'B', 0: 'C' };
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Weeks 1-8: walk/run intervals, then continuous running. [runMin, walkMin, reps]
const INTERVALS = [
  [1, 2, 6], [2, 2, 5], [3, 2, 4], [5, 2, 3],
  [8, 2, 2], [10, 2, 2], [20, 0, 1], [25, 0, 1],
];
const WEEK9_KM = 14; // weekly total in week 9, roughly what week 8 covers
const GROWTH = 1.08; // +8 % per week (never more than ~10 %)
const MAX_WEEK_KM = 35;
const SPLIT = { 1: 0.2, 3: 0.2, 5: 0.25, 6: 0.35 }; // share of weekly km per run day

export function weeklyKmTarget(week) {
  if (week < 9) return null;
  let km = WEEK9_KM;
  for (let w = 10; w <= week; w++) {
    if ((w - 8) % 4 === 0) continue; // easy week every 4th week: stay put (see below)
    km = Math.min(MAX_WEEK_KM, km * GROWTH);
  }
  const easy = (week - 8) % 4 === 0 && week > 8;
  return Math.round(km * (easy ? 0.8 : 1) * 10) / 10;
}

export function currentWeek(date = new Date()) {
  const w = Math.floor(daysBetween(mondayOf(pdate(S().startDate)), mondayOf(date)) / 7) + 1;
  return Math.max(1, w + (S().settings.planOffset || 0));
}

/** The planned run for a given plan week + weekday, or null on a rest day. */
export function runFor(week, weekday) {
  if (!RUN_DAYS.includes(weekday)) return null;
  if (week <= INTERVALS.length) {
    const [run, walk, reps] = INTERVALS[week - 1];
    const segs = [{ t: 'walk', s: 300, label: 'Warm-up walk' }];
    for (let i = 0; i < reps; i++) {
      segs.push({ t: 'run', s: run * 60, label: 'Run' });
      if (walk && i < reps - 1) segs.push({ t: 'walk', s: walk * 60, label: 'Walk' });
    }
    segs.push({ t: 'walk', s: 300, label: 'Cool-down walk' });
    const mins = segs.reduce((a, x) => a + x.s, 0) / 60;
    const text = walk ? `${reps} × (${run} min run + ${walk} min walk)` : `${run} min easy run`;
    return { kind: 'interval', segs, mins, title: text, sub: `5 min warm-up + 5 min cool-down walk · ${mins} min total` };
  }
  const km = Math.round(weeklyKmTarget(week) * SPLIT[weekday] * 10) / 10;
  const easy = (week - 8) % 4 === 0;
  return { kind: 'distance', km, title: `${km.toFixed(1)} km easy run`, sub: easy ? 'Easy week: lighter load to recover' : 'Steady pace, you should be able to talk' };
}

export const plannedRunToday = () => runFor(currentWeek(), new Date().getDay());
export const workoutKeyToday = () => WORKOUT_FOR_DAY[new Date().getDay()] || null;

export function weekPlan(week, monday) {
  return [1, 2, 3, 4, 5, 6, 0].map((wd, i) => {
    const date = dstr(addDays(monday, i));
    return { wd, date, run: runFor(week, wd), workout: WORKOUT_FOR_DAY[wd] || null };
  });
}

// ---------- Exercises ----------
// rest = seconds between sets
export const WORKOUTS = {
  A: {
    name: 'Workout A', focus: 'Legs + push',
    ex: [
      { id: 'squat', name: 'Backpack squat', sets: 3, reps: 12, rest: 60, how: 'Hug the backpack to your chest. Feet shoulder-width. Sit hips back and down until thighs are parallel, chest up, then stand.' },
      { id: 'pushup', name: 'Push-ups (knees or incline)', sets: 3, reps: 8, rest: 60, how: 'Hands under shoulders, body in one line. Lower chest to the floor, push back up. Use knees or hands on a table if needed.' },
      { id: 'bridge', name: 'Backpack glute bridge', sets: 3, reps: 15, rest: 45, how: 'Lie on your back, knees bent, backpack on your hips. Drive hips up, squeeze glutes at the top for 1 second, lower slowly.' },
      { id: 'row', name: 'Backpack bent-over row', sets: 3, reps: 12, rest: 60, how: 'Hinge forward with a flat back, backpack hanging from both hands. Pull it to your belly, squeeze shoulder blades, lower slowly.' },
      { id: 'plank', name: 'Plank (seconds)', sets: 3, reps: 30, rest: 45, unit: 's', how: 'Forearms on the floor, body in a straight line from head to heels. Tighten tummy and glutes. Don\'t let hips sag.' },
    ],
  },
  B: {
    name: 'Workout B', focus: 'Legs + shoulders + back',
    ex: [
      { id: 'lunge', name: 'Reverse lunge (per leg)', sets: 3, reps: 10, rest: 60, how: 'Step one leg back, lower until both knees are about 90°, push through the front heel to return. Backpack on your back or held at chest.' },
      { id: 'press', name: 'Backpack shoulder press', sets: 3, reps: 12, rest: 60, how: 'Hold the backpack by the top handle at shoulder height. Press straight overhead without arching your back, lower under control.' },
      { id: 'rdl', name: 'Backpack Romanian deadlift', sets: 3, reps: 12, rest: 60, how: 'Soft knees, backpack in front of thighs. Push hips back, slide the bag down your legs with a flat back, then squeeze glutes to stand.' },
      { id: 'calf', name: 'Calf raises', sets: 3, reps: 15, rest: 30, how: 'Stand tall, rise onto your toes, pause 1 second, lower slowly. Hold a wall for balance.' },
      { id: 'deadbug', name: 'Dead bug (per side)', sets: 3, reps: 8, rest: 30, how: 'On your back, arms up, knees over hips. Lower opposite arm and leg slowly while your lower back stays pressed into the floor.' },
    ],
  },
  C: {
    name: 'Workout C', focus: 'Full body + core',
    ex: [
      { id: 'sumo', name: 'Backpack sumo squat', sets: 3, reps: 12, rest: 60, how: 'Feet wide, toes out, backpack hanging between your legs. Lower straight down, knees tracking over toes, then stand and squeeze glutes.' },
      { id: 'floorpress', name: 'Backpack floor press', sets: 3, reps: 12, rest: 60, how: 'Lie on your back, backpack held at chest. Press it straight up, lower until elbows touch the floor, repeat.' },
      { id: 'superman', name: 'Superman hold', sets: 3, reps: 12, rest: 45, how: 'Lie face down, arms forward. Lift arms, chest and legs a few cm, hold 2 seconds, lower. Strengthens lower back and posture.' },
      { id: 'wallsit', name: 'Wall sit (seconds)', sets: 3, reps: 30, rest: 45, unit: 's', how: 'Back flat on a wall, thighs parallel to the floor, knees over ankles. Hold and breathe.' },
      { id: 'climber', name: 'Mountain climbers (seconds)', sets: 3, reps: 20, rest: 45, unit: 's', how: 'High plank position. Drive knees toward your chest one after the other at a steady pace. Keep hips low.' },
    ],
  },
};

export const PROGRESSION = [
  'Reps first: add 1–2 reps per set each week until you reach the top of the range (about 15 reps).',
  'Then weight: add books or water bottles to the backpack and drop back to the lower reps.',
  'Then harder variation: push-ups from knees → full push-ups, squats → split squats, plank → plank with shoulder taps.',
];

// Timed routines. rest = seconds of rest after the step.
export const ROUTINES = {
  abs: [
    {
      id: 'abs1', name: 'Beginner abs', mins: 8, blurb: 'Plank, dead bug, bird dog, leg raises and side planks.',
      steps: [
        { id: 'plank', name: 'Plank', sec: 30, rest: 15, how: 'Forearms down, body straight, tummy tight. Breathe steadily.' },
        { id: 'deadbug', name: 'Dead bug', sec: 40, rest: 15, how: 'Lie on your back, arms up, knees over hips. Slowly lower opposite arm and leg, back stays flat.' },
        { id: 'birddog', name: 'Bird dog', sec: 40, rest: 15, how: 'On hands and knees. Reach opposite arm and leg out, hold 2 seconds, switch. Keep hips level.' },
        { id: 'revcrunch', name: 'Reverse crunch', sec: 30, rest: 15, how: 'On your back, knees bent at 90°. Curl hips off the floor using your lower abs, lower slowly. No swinging.' },
        { id: 'legraise', name: 'Lying leg raises', sec: 30, rest: 15, how: 'Legs straight (or slightly bent), lower them slowly toward the floor without arching your back, then lift.' },
        { id: 'sideR', name: 'Side plank: right', sec: 20, rest: 10, how: 'On your right forearm, hips lifted, body in a line. Knees down to make it easier.' },
        { id: 'sideL', name: 'Side plank: left', sec: 20, rest: 0, how: 'Same on your left side.' },
      ],
    },
    {
      id: 'abs2', name: 'Core burner', mins: 7, blurb: 'A slightly tougher round once the beginner routine feels easy.',
      steps: [
        { id: 'plank2', name: 'Plank', sec: 40, rest: 15, how: 'Forearms down, body straight, squeeze glutes.' },
        { id: 'climber2', name: 'Slow mountain climbers', sec: 30, rest: 15, how: 'High plank, bring knees to chest one at a time, controlled.' },
        { id: 'revcrunch2', name: 'Reverse crunch', sec: 40, rest: 15, how: 'Curl hips up and off the floor, lower slowly.' },
        { id: 'flutter', name: 'Flutter kicks', sec: 30, rest: 15, how: 'Lie back, legs low and straight, small fast alternating kicks. Hands under hips if your back arches.' },
        { id: 'birddog2', name: 'Bird dog', sec: 40, rest: 15, how: 'Opposite arm and leg, hold 2 seconds each rep.' },
        { id: 'sideR2', name: 'Side plank: right', sec: 25, rest: 10, how: 'Forearm down, hips high.' },
        { id: 'sideL2', name: 'Side plank: left', sec: 25, rest: 0, how: 'Other side.' },
      ],
    },
  ],
  yoga: [
    {
      id: 'yogaP', name: 'Posture reset', mins: 8, blurb: 'Opens chest and shoulders, good after sitting and studying.',
      steps: [
        { id: 'mountain', name: 'Mountain pose', sec: 30, rest: 0, how: 'Stand tall, feet together, shoulders relaxed and back, arms by your sides. Lengthen the crown of your head up.' },
        { id: 'catcow', name: 'Cat–cow', sec: 60, rest: 0, how: 'On hands and knees. Inhale: drop belly, lift chest. Exhale: round your back, chin to chest. Move slowly with your breath.' },
        { id: 'cobra', name: 'Cobra', sec: 30, rest: 0, how: 'Lie face down, hands under shoulders. Lift your chest using your back, elbows soft, shoulders away from ears.' },
        { id: 'child', name: 'Child\'s pose', sec: 45, rest: 0, how: 'Sit back on your heels, fold forward, arms long. Breathe into your back.' },
        { id: 'dog', name: 'Downward dog', sec: 30, rest: 0, how: 'From hands and knees, lift hips up and back. Press the floor away, heels reaching down, knees bent if hamstrings are tight.' },
        { id: 'fold', name: 'Standing forward fold', sec: 40, rest: 0, how: 'Hinge from the hips, let your head hang, knees soft. Slowly roll up at the end.' },
        { id: 'chest', name: 'Chest opener (hands clasped behind)', sec: 30, rest: 0, how: 'Stand tall, clasp hands behind your back, straighten arms and lift them slightly, open the chest.' },
      ],
    },
    {
      id: 'yogaF', name: 'Flexibility (hips & legs)', mins: 10, blurb: 'Good after runs: hips, hamstrings and calves.',
      steps: [
        { id: 'lungeR', name: 'Low lunge: right foot forward', sec: 40, rest: 0, how: 'Right foot forward, left knee down. Sink hips forward and down, torso upright.' },
        { id: 'lungeL', name: 'Low lunge: left foot forward', sec: 40, rest: 0, how: 'Same on the other side.' },
        { id: 'hamstring', name: 'Seated forward bend', sec: 45, rest: 0, how: 'Sit with legs straight, hinge forward from the hips and reach toward your feet. Back long, no forcing.' },
        { id: 'fig4R', name: 'Figure-4 stretch: right', sec: 40, rest: 0, how: 'On your back, right ankle on left knee, pull the left thigh toward you. Stretch in the right hip.' },
        { id: 'fig4L', name: 'Figure-4 stretch: left', sec: 40, rest: 0, how: 'Same on the other side.' },
        { id: 'cobbler', name: 'Butterfly', sec: 40, rest: 0, how: 'Sit, soles of feet together, knees out. Lean forward slightly with a long back.' },
        { id: 'twistR', name: 'Supine twist: right', sec: 30, rest: 0, how: 'On your back, drop both knees to the right, arms wide, look left.' },
        { id: 'twistL', name: 'Supine twist: left', sec: 30, rest: 0, how: 'Same on the other side.' },
      ],
    },
    {
      id: 'yogaR', name: 'Relax & sleep', mins: 7, blurb: 'Slow, calm, great in the evening.',
      steps: [
        { id: 'child2', name: 'Child\'s pose', sec: 60, rest: 0, how: 'Knees wide, forehead down, arms long. Slow deep breaths.' },
        { id: 'happy', name: 'Happy baby', sec: 40, rest: 0, how: 'On your back, hold your feet or shins, knees toward armpits, rock gently.' },
        { id: 'legs', name: 'Legs up the wall', sec: 120, rest: 0, how: 'Lie with your hips close to a wall and your legs resting up it. Arms relaxed. Breathe in for 4, out for 6.' },
        { id: 'corpse', name: 'Final rest (corpse pose)', sec: 120, rest: 0, how: 'Lie flat, arms a little away from your body, palms up. Let every muscle go heavy.' },
      ],
    },
  ],
};

export const QUOTES = [
  'Showing up is the whole game.',
  'Slow progress is still progress.',
  'The morning run is a promise you keep to yourself.',
  'You don\'t have to be fast. You just have to start.',
  'Consistency beats intensity.',
  'Every km adds up.',
  'Today\'s effort is tomorrow\'s energy.',
];
