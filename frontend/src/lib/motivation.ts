export type MotivationContext =
  | "pre_workout"
  | "post_workout"
  | "missed_workout"
  | "protein_low"
  | "streak"
  | "pr"
  | "general";

// 30+ phrases fixes, en français, ton encourageant sans bullshit motivationnel.
const BANK: Record<MotivationContext, string[]> = {
  pre_workout: [
    "La séance ne se discute pas, elle se fait.",
    "Une rep de plus que la dernière fois. C'est tout.",
    "Échauffe-toi correctement, ensuite tu pousses.",
    "Pas besoin d'être motivé. Sois discipliné.",
    "Volume, technique, repos. Le reste c'est du bruit.",
  ],
  post_workout: [
    "Séance encaissée. Récupération maintenant.",
    "Tu viens d'investir 45 minutes pour les 10 prochaines années.",
    "Bonne séance. Protéines, sommeil, on recommence.",
    "Ce que tu viens de faire ne se voit pas tout de suite. Ça va finir par parler.",
    "Job done. Note ce qui a marché, fais mieux la prochaine fois.",
  ],
  missed_workout: [
    "Une séance ratée, ça arrive. Deux d'affilée, on intervient.",
    "Bouger 20 minutes vaut mieux que zéro.",
    "Le programme attend, mais pas indéfiniment.",
    "Si la fatigue parle, la discipline répond.",
    "Reprogramme aujourd'hui. Demain c'est déjà tard.",
  ],
  protein_low: [
    "Il manque des protéines aujourd'hui. Un shaker, un yaourt, du blanc d'œuf — au choix.",
    "Sans protéines, pas de reconstruction musculaire. C'est mécanique.",
    "Vise ta cible avant minuit. Un dernier apport simple fait l'affaire.",
    "Tu construis avec ce que tu manges. Aujourd'hui le chantier manque de matière.",
  ],
  streak: [
    "Le streak tient. Continue, sans en faire trop.",
    "La constance bat l'intensité.",
    "C'est ce que tu fais quand personne ne regarde qui paie.",
  ],
  pr: [
    "Nouveau record. Mesuré, prouvé.",
    "Tu viens de bouger un peu plus que toi-même il y a 4 semaines.",
    "PR battu. Note la charge, la technique a tenu ?",
  ],
  general: [
    "La méthode. Pas la motivation.",
    "Données, pas opinion.",
    "Tu suis. Tu mesures. Tu ajustes.",
  ],
};

export function pickQuote(ctx: MotivationContext, seed?: number): string {
  const arr = BANK[ctx] || BANK.general;
  const idx = typeof seed === "number" ? Math.abs(seed) % arr.length : Math.floor(Math.random() * arr.length);
  return arr[idx];
}

export function quoteForToday(ctx: MotivationContext): string {
  // Stable seed = day-of-year so it doesn't change at every render but rotates each day.
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const day = Math.floor(diff / 86400000);
  return pickQuote(ctx, day);
}
