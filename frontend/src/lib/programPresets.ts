import { colors } from "@/src/theme";

export type ProgramGoalId = "cut" | "mass" | "recomp" | "strength" | "power" | "restart";
export type Split = "ppl" | "fullbody" | "split";
export type ProgramFrequency = 2 | 3 | 4;

export type ProgramPreset = {
  id: ProgramGoalId;
  goalLabel: string;
  title: string;
  tagline: string;
  accent: string;
  image: "program" | "activities" | "progress";
  defaultWeeks: 6 | 8 | 10 | 12;
  defaultFrequency: ProgramFrequency;
  defaultSplit: Split;
  splits: {
    two: string;
    three: string;
  };
  parameters: string[];
  phases: string[];
  progression: string[];
  outcomes: string[];
  motivation: string;
  science: string[];
};

export const PROGRAM_PRESETS: ProgramPreset[] = [
  {
    id: "cut",
    goalLabel: "Perte de gras",
    title: "Seche intelligente",
    tagline: "Bruler du gras sans sacrifier tes muscles",
    accent: colors.amber,
    image: "activities",
    defaultWeeks: 8,
    defaultFrequency: 3,
    defaultSplit: "fullbody",
    splits: {
      two: "Full Body A / Full Body B",
      three: "Bas du corps / Haut du corps / Full Body metabolique",
    },
    parameters: [
      "Polyarticulaires : 3 x 8-12 reps, repos 75-90s",
      "Accessoires : 3 x 12-15 reps, repos 45-60s",
      "Gainage : 3 x 30-45s, RPE 7-8",
      "Cardio optionnel : 10-20 min zone 2 ou marche rapide",
    ],
    phases: ["S1-S3 Base", "S4-S6 Progression", "S7-S8 Consolidation / test"],
    progression: [
      "Toutes les series validees : +1 rep la semaine suivante",
      "Haut de fourchette atteint : +2,5 a 5% de charge",
      "Fatigue elevee : volume reduit de 10-20%",
    ],
    outcomes: [
      "-2 a -5% du poids corporel en 8 semaines",
      "90-95% de masse musculaire preservee si assiduite + proteines",
      "+10 a +25% d'endurance musculaire",
      "80% des seances realisees",
    ],
    motivation:
      "Objectif : bruler du gras sans sacrifier tes muscles. On garde assez lourd pour preserver la force, et assez dense pour augmenter la depense.",
    science: [
      "2018 : la musculation en restriction calorique aide a preserver presque toute la masse maigre.",
      "2021 : plusieurs plages de repetitions peuvent developper le muscle si l'effort est suffisant.",
    ],
  },
  {
    id: "mass",
    goalLabel: "Masse",
    title: "Prise de masse progressive",
    tagline: "Construire du muscle proprement",
    accent: colors.primaryLight,
    image: "program",
    defaultWeeks: 12,
    defaultFrequency: 3,
    defaultSplit: "ppl",
    splits: {
      two: "Full Body A / Full Body B",
      three: "Push / Pull / Legs ou Haut / Bas / Full Body",
    },
    parameters: [
      "Principaux : 4 x 8-12 reps, repos 90-120s",
      "Secondaires : 3 x 10-12 reps",
      "Isolation : 2-3 x 12-15 reps, repos 60-75s",
      "Intensite : RPE 7-9",
    ],
    phases: ["S1-S4 Volume", "S5-S8 Force-hypertrophie", "S9-S11 Intensification", "S12 Deload + test"],
    progression: [
      "Double progression : reps avant charge",
      "Haut de fourchette atteint partout : +2,5 a 5%",
      "Deload si stagnation 2 semaines ou fatigue elevee",
    ],
    outcomes: [
      "+1 a +3% du poids corporel en 12 semaines",
      "+0,5 a +2,5 kg de muscle estime selon niveau",
      "+5 a +20% de force sur les mouvements principaux",
      "85% des seances realisees",
    ],
    motivation:
      "Objectif : construire du muscle sans prise de gras excessive. On augmente progressivement le volume, la charge et la qualite d'execution.",
    science: [
      "2017 : plus le volume hebdomadaire augmente, plus les gains musculaires progressent.",
      "2017 : chaque serie supplementaire est associee a une hausse mesurable du gain musculaire.",
    ],
  },
  {
    id: "recomp",
    goalLabel: "Recomposition",
    title: "Recomposition",
    tagline: "Plus sec, plus dense, sans obsession balance",
    accent: colors.aqua,
    image: "progress",
    defaultWeeks: 10,
    defaultFrequency: 3,
    defaultSplit: "fullbody",
    splits: {
      two: "Full Body A / Full Body B",
      three: "Full Body A / Full Body B / Full Body C",
    },
    parameters: [
      "Principaux : 3-4 x 6-10 reps, repos 90-120s",
      "Accessoires : 3 x 10-15 reps, repos 45-75s",
      "Intensite : RPE 7-8",
    ],
    phases: ["S1-S3 Volume", "S4-S6 Force", "S7-S9 Intensification", "S10 Consolidation"],
    progression: [
      "Priorite a la regularite",
      "Augmenter la charge si performance stable",
      "Reduire le volume si sommeil ou recuperation faible",
    ],
    outcomes: [
      "Poids stable ou legere baisse : -1 a -3%",
      "-1 a -3 points de masse grasse estimee",
      "+0,5 a +1,5 kg de muscle possible",
      "+5 a +15% de force",
    ],
    motivation:
      "Objectif : paraitre plus sec et plus muscle sans forcement changer beaucoup le poids sur la balance.",
    science: [
      "2021 : charges lourdes et repetitions moderees peuvent construire du muscle si l'effort est suffisant.",
      "2022 : feedbacks et barres de progression augmentent l'engagement dans l'activite physique.",
    ],
  },
  {
    id: "strength",
    goalLabel: "Force",
    title: "Force controlee",
    tagline: "Devenir fort sans bruler les etapes",
    accent: "#F87171",
    image: "program",
    defaultWeeks: 8,
    defaultFrequency: 3,
    defaultSplit: "fullbody",
    splits: {
      two: "Full Body Force A / Full Body Force B",
      three: "Squat focus / Push focus / Pull focus",
    },
    parameters: [
      "Principaux : 4-5 x 4-6 reps, repos 2-3 min",
      "Secondaires : 3 x 6-8 reps",
      "Accessoires : 2-3 x 10-12 reps, repos 90s",
      "Intensite : RPE 7-9",
    ],
    phases: ["S1-S3 Base", "S4-S6 Progression", "S7-S8 Consolidation / test"],
    progression: [
      "+2,5% si toutes les series passent proprement",
      "Conserver 1 a 2 reps en reserve",
      "Semaine 8 : test 3RM ou estimation 1RM",
    ],
    outcomes: [
      "+5 a +20% de force estimee",
      "Technique plus propre sur mouvements principaux",
      "+10 a +25% de volume total souleve",
      "1 a 3 records possibles",
    ],
    motivation:
      "Objectif : devenir plus fort sans bruler les etapes. On privilegie la qualite, les temps de repos longs et la progression mesurable.",
    science: [
      "2016 : des temps de repos plus longs ameliorent davantage la force et l'hypertrophie.",
      "2021 : les charges lourdes maximisent surtout la force.",
    ],
  },
  {
    id: "power",
    goalLabel: "Puissance",
    title: "Puissance",
    tagline: "Force rapide, mouvement propre",
    accent: "#F59E0B",
    image: "activities",
    defaultWeeks: 8,
    defaultFrequency: 3,
    defaultSplit: "fullbody",
    splits: {
      two: "Full Body explosif A / Full Body explosif B",
      three: "Haut / Bas / Full Body explosif",
    },
    parameters: [
      "Explosifs : 3-5 x 1-6 reps",
      "Force : 3-4 x 4-6 reps",
      "Accessoires : 2-3 x 8-12 reps",
      "Repos explosif / force : 2-3 min",
    ],
    phases: ["S1-S3 Adaptation", "S4-S6 Progression", "S7-S8 Vitesse / test"],
    progression: [
      "Ne pas augmenter si la vitesse baisse trop",
      "Priorite a la qualite du mouvement",
      "Deload si fatigue nerveuse ou baisse nette de performance",
    ],
    outcomes: [
      "+5 a +15% de force explosive",
      "Vitesse percue en hausse",
      "Meilleure coordination",
      "Fatigue mieux controlee",
    ],
    motivation:
      "Objectif : produire plus de force rapidement. Chaque rep doit etre propre, rapide et controlee.",
    science: [
      "2021 : les charges lourdes maximisent la force, la vitesse depend surtout d'une execution propre.",
      "2022 : objectifs courts et feedback visuel renforcent l'engagement.",
    ],
  },
  {
    id: "restart",
    goalLabel: "Remise en forme",
    title: "Remise en forme",
    tagline: "Revenir, simplement, puis progresser",
    accent: "#A7F3D0",
    image: "progress",
    defaultWeeks: 6,
    defaultFrequency: 2,
    defaultSplit: "fullbody",
    splits: {
      two: "Full Body A / Full Body B",
      three: "Full Body A / Full Body B / Mobilite active",
    },
    parameters: [
      "2-3 series par exercice",
      "10-15 reps",
      "Repos 60-90s",
      "RPE 6-7, seance courte 35-45 min",
    ],
    phases: ["S1-S3 Adaptation", "S4-S6 Progression"],
    progression: [
      "D'abord finir les seances",
      "Ensuite ajouter des reps",
      "Augmenter la charge seulement quand le geste est stable",
    ],
    outcomes: [
      "80% de regularite",
      "+10 a +30% d'endurance musculaire",
      "Meilleure energie ressentie",
      "Habitude durable installee",
    ],
    motivation: "Objectif : construire les bases. Pas besoin d'etre parfait, il faut juste revenir.",
    science: [
      "2022 : points, recompenses, feedbacks et progression visible augmentent l'engagement.",
      "2016 : des repos suffisants aident a mieux progresser.",
    ],
  },
];

export function presetByGoal(goal?: string | null): ProgramPreset {
  const normalized = (goal || "").toLowerCase();
  return (
    PROGRAM_PRESETS.find((preset) =>
      [preset.goalLabel, preset.title, preset.id].some((value) => value.toLowerCase() === normalized)
    ) ||
    PROGRAM_PRESETS.find((preset) => normalized.includes(preset.goalLabel.toLowerCase())) ||
    PROGRAM_PRESETS[1]
  );
}

export function phaseForWeek(weeksTotal: number, weekIndex: number): string {
  if (weeksTotal <= 6) return weekIndex <= 3 ? "Adaptation" : "Progression";
  if (weeksTotal <= 8) {
    if (weekIndex <= 3) return "Base";
    if (weekIndex <= 6) return "Progression";
    return "Consolidation / test";
  }
  if (weekIndex <= 3) return "Volume";
  if (weekIndex <= 6) return "Force";
  if (weekIndex <= 9) return "Intensification";
  return "Consolidation / deload";
}

export function weeklyAiAdvice(sessionType?: string, weekIndex = 1): string {
  if (sessionType === "force") return "Garde 1 a 2 reps en reserve. Si tout passe proprement, +2,5% la semaine suivante.";
  if (sessionType === "puissance") return "Priorite a la vitesse propre. Si la vitesse baisse, garde la charge.";
  if (weekIndex % 4 === 0) return "Semaine charniere : surveille sommeil et fatigue avant d'ajouter du volume.";
  return "Si toutes les series sont validees avec RPE <= 8, ajoute 1 rep ou un petit palier de charge.";
}

export const SCIENCE_NOTES = [
  "2017 : plus le volume hebdomadaire augmente, plus les gains musculaires progressent.",
  "2017 : chaque serie supplementaire est associee a une hausse mesurable du gain musculaire.",
  "2018 : l'entrainement en resistance pendant une restriction calorique aide a preserver presque toute la masse maigre.",
  "2016 : des temps de repos plus longs ameliorent davantage la force et l'hypertrophie que des repos trop courts.",
  "2021 : les charges lourdes maximisent la force, tandis que plusieurs plages de repetitions peuvent developper le muscle si l'effort est suffisant.",
  "2022 : les objectifs, recompenses, points, feedbacks et barres de progression augmentent l'engagement dans l'activite physique.",
];
