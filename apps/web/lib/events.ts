import type { TimelineEvent } from "./types";

const wiki = (title: string) =>
  `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

export const EVENTS: TimelineEvent[] = [
  {
    id: "cuneiform-writing",
    year: -3200,
    title: "Invention of writing",
    description:
      "Cuneiform script emerges in Sumer, marking the beginning of recorded history.",
    significance: 0.95,
    wikipediaUrl: wiki("Cuneiform"),
  },
  {
    id: "great-pyramid",
    year: -2560,
    title: "Great Pyramid of Giza",
    description:
      "The Great Pyramid is completed during the reign of Pharaoh Khufu.",
    significance: 0.9,
    wikipediaUrl: wiki("Great_Pyramid_of_Giza"),
  },
  {
    id: "founding-rome",
    year: -753,
    title: "Founding of Rome",
    description:
      "Rome is founded, according to legend, by Romulus and Remus.",
    significance: 0.75,
    wikipediaUrl: wiki("Founding_of_Rome"),
  },
  {
    id: "battle-marathon",
    year: -490,
    title: "Battle of Marathon",
    description:
      "Athenians defeat the Persians at Marathon, a pivotal moment in the Greco-Persian Wars.",
    significance: 0.45,
    wikipediaUrl: wiki("Battle_of_Marathon"),
  },
  {
    id: "peloponnesian-war",
    year: -431,
    title: "Peloponnesian War begins",
    description:
      "Sparta and Athens begin a decades-long war that reshapes the Greek world.",
    significance: 0.4,
    wikipediaUrl: wiki("Peloponnesian_War"),
  },
  {
    id: "death-alexander",
    year: -323,
    title: "Death of Alexander the Great",
    description:
      "Alexander dies in Babylon; his empire fragments among his generals.",
    significance: 0.8,
    wikipediaUrl: wiki("Alexander_the_Great"),
  },
  {
    id: "qin-unification",
    year: -221,
    title: "Qin unification of China",
    description:
      "Qin Shi Huang unifies China and becomes its first emperor.",
    significance: 0.55,
    wikipediaUrl: wiki("Qin_dynasty"),
  },
  {
    id: "death-cleopatra",
    year: -30,
    title: "Death of Cleopatra",
    description:
      "Cleopatra VII dies; Roman Egypt begins, ending the Ptolemaic dynasty.",
    significance: 0.72,
    wikipediaUrl: wiki("Cleopatra"),
  },
  {
    id: "assassination-caesar",
    year: -44,
    title: "Assassination of Julius Caesar",
    description:
      "Caesar is assassinated on the Ides of March, precipitating the fall of the Roman Republic.",
    significance: 0.78,
    wikipediaUrl: wiki("Julius_Caesar"),
  },
  {
    id: "fall-rome",
    year: 476,
    title: "Fall of the Western Roman Empire",
    description:
      "The last Western Roman emperor is deposed, traditionally marking the end of antiquity.",
    significance: 0.82,
    wikipediaUrl: wiki("Fall_of_the_Western_Roman_Empire"),
  },
  {
    id: "hijra",
    year: 622,
    title: "The Hijra",
    description:
      "Muhammad's migration from Mecca to Medina marks the start of the Islamic calendar.",
    significance: 0.65,
    wikipediaUrl: wiki("Hegira"),
  },
  {
    id: "battle-hastings",
    year: 1066,
    title: "Battle of Hastings",
    description:
      "William the Conqueror defeats Harold II, beginning the Norman conquest of England.",
    significance: 0.5,
    wikipediaUrl: wiki("Battle_of_Hastings"),
  },
  {
    id: "first-crusade",
    year: 1095,
    title: "First Crusade launched",
    description:
      "Pope Urban II calls for the First Crusade at the Council of Clermont.",
    significance: 0.5,
    wikipediaUrl: wiki("First_Crusade"),
  },
  {
    id: "genghis-khan",
    year: 1206,
    title: "Genghis Khan unites the Mongols",
    description:
      "Temüjin is proclaimed Genghis Khan, founding the Mongol Empire.",
    significance: 0.6,
    wikipediaUrl: wiki("Genghis_Khan"),
  },
  {
    id: "magna-carta",
    year: 1215,
    title: "Magna Carta sealed",
    description:
      "King John seals the Magna Carta, limiting royal power in England.",
    significance: 0.7,
    wikipediaUrl: wiki("Magna_Carta"),
  },
];
