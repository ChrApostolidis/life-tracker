function dayOfYear(now: Date): number {
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
}

export function greetingWord(now: Date): 'morning' | 'afternoon' | 'evening' {
  const hour = now.getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

const FLAVOR_LINES = [
  'One page at a time.',
  'Small moves, repeated.',
  'The plan is the easy part.',
  'Today counts too.',
  'Nobody is watching but you.',
  'Consistency beats intensity.',
  'Start before you feel ready.',
  'The list will wait — you go first.',
  'Momentum is built, not found.',
  'Do the boring part first.',
  'Progress hides in ordinary days.',
  'Show up, then figure it out.',
  'The streak is just yesterday, repeated.',
  'Fewer tabs, more done.',
  'You already know the first step.',
];

const STREAK_FLAVOR_LINES = [
  (n: number) => `Day ${n} of not breaking the chain.`,
  (n: number) => `${n} days in. Keep it boring, keep it going.`,
  (n: number) => `${n}-day streak. That's the whole strategy.`,
];

export function pickFlavorLine(now: Date, activeStreak: number): string {
  // On a real streak, lean into it about a third of the time — enough to feel
  // earned, not so much that it's the only thing the page ever says.
  const day = dayOfYear(now);
  if (activeStreak >= 3 && day % 3 === 0) {
    const streakLine = STREAK_FLAVOR_LINES[day % STREAK_FLAVOR_LINES.length];
    return streakLine(activeStreak);
  }
  return FLAVOR_LINES[day % FLAVOR_LINES.length];
}

export type Quote = { text: string; author: string };

const QUOTES: Quote[] = [
  { text: 'We are what we repeatedly do.', author: 'Aristotle' },
  { text: 'Well begun is half done.', author: 'Aristotle' },
  { text: 'The obstacle is the way.', author: 'Marcus Aurelius' },
  { text: 'Waste no more time arguing what a good man should be. Be one.', author: 'Marcus Aurelius' },
  { text: 'It is not that we have a short time to live, but that we waste a lot of it.', author: 'Seneca' },
  { text: 'Luck is what happens when preparation meets opportunity.', author: 'Seneca' },
  { text: 'First say to yourself what you would be, then do what you have to do.', author: 'Epictetus' },
  { text: 'No man ever steps in the same river twice.', author: 'Heraclitus' },
  { text: 'A journey of a thousand miles begins with a single step.', author: 'Lao Tzu' },
  { text: 'The best time to plant a tree was twenty years ago. The second best time is now.', author: 'Chinese Proverb' },
  { text: 'Our greatest glory is not in never falling, but in rising every time we fall.', author: 'Confucius' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: 'Discipline is choosing between what you want now and what you want most.', author: 'Abraham Lincoln' },
  { text: 'Whether you think you can, or you think you can’t, you’re right.', author: 'Henry Ford' },
  { text: 'Quality is not an act, it is a habit.', author: 'Will Durant' },
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'It always seems impossible until it’s done.', author: 'Nelson Mandela' },
  { text: 'Perfection is not attainable, but if we chase perfection we can catch excellence.', author: 'Vince Lombardi' },
  { text: 'I hated every minute of training, but I said, don’t quit. Suffer now and live the rest of your life as a champion.', author: 'Muhammad Ali' },
  { text: 'What we plant in the soil of contemplation, we shall reap in the harvest of action.', author: 'Meister Eckhart' },
  { text: 'The chains of habit are too weak to be felt until they are too strong to be broken.', author: 'Samuel Johnson' },
  { text: 'Motivation gets you going, but discipline keeps you growing.', author: 'John C. Maxwell' },
  { text: 'You do not rise to the level of your goals; you fall to the level of your systems.', author: 'James Clear' },
  { text: 'Amateurs sit and wait for inspiration; the rest of us just get up and go to work.', author: 'Stephen King' },
  { text: 'The pain of discipline weighs ounces; the pain of regret weighs tons.', author: 'Jim Rohn' },
  { text: 'What gets measured gets managed.', author: 'Peter Drucker' },
  { text: 'You can’t build a reputation on what you are going to do.', author: 'Henry Ford' },
  { text: 'The future depends on what you do today.', author: 'Mahatma Gandhi' },
  { text: 'A year from now you may wish you had started today.', author: 'Karen Lamb' },
  { text: 'Small daily improvements are the key to staggering long-term results.', author: 'Robin Sharma' },
];

export function pickQuote(now: Date): Quote {
  return QUOTES[dayOfYear(now) % QUOTES.length];
}
