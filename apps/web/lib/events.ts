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
  {
    id: "black-death",
    year: 1347,
    title: "Black Death reaches Europe",
    description:
      "The bubonic plague arrives in Europe, killing a large share of the population.",
    significance: 0.82,
    wikipediaUrl: wiki("Black_Death"),
  },
  {
    id: "printing-press",
    year: 1440,
    title: "Gutenberg's printing press",
    description:
      "Johannes Gutenberg develops movable type, transforming the spread of knowledge.",
    significance: 0.92,
    wikipediaUrl: wiki("Printing_press"),
  },
  {
    id: "fall-constantinople",
    year: 1453,
    title: "Fall of Constantinople",
    description:
      "The Ottoman Empire captures Constantinople, ending the Byzantine Empire.",
    significance: 0.72,
    wikipediaUrl: wiki("Fall_of_Constantinople"),
  },
  {
    id: "columbus-americas",
    year: 1492,
    title: "Columbus reaches the Americas",
    description:
      "Christopher Columbus's first voyage lands in the Americas.",
    significance: 0.85,
    wikipediaUrl: wiki("Voyages_of_Christopher_Columbus"),
  },
  {
    id: "reformation",
    year: 1517,
    title: "Protestant Reformation begins",
    description:
      "Martin Luther posts his Ninety-five Theses, igniting the Reformation.",
    significance: 0.6,
    wikipediaUrl: wiki("Reformation"),
  },
  {
    id: "newton-principia",
    year: 1687,
    title: "Newton's Principia published",
    description:
      "Isaac Newton publishes the Principia, laying the foundations of classical mechanics.",
    significance: 0.62,
    wikipediaUrl: wiki("Philosophiæ_Naturalis_Principia_Mathematica"),
  },
  {
    id: "us-independence",
    year: 1776,
    title: "U.S. Declaration of Independence",
    description:
      "The Thirteen Colonies declare independence from Great Britain.",
    significance: 0.8,
    wikipediaUrl: wiki("United_States_Declaration_of_Independence"),
  },
  {
    id: "french-revolution",
    year: 1789,
    title: "French Revolution begins",
    description:
      "The storming of the Bastille begins a revolution that reshapes France and Europe.",
    significance: 0.8,
    wikipediaUrl: wiki("French_Revolution"),
  },
  {
    id: "origin-of-species",
    year: 1859,
    title: "On the Origin of Species",
    description:
      "Charles Darwin publishes his theory of evolution by natural selection.",
    significance: 0.78,
    wikipediaUrl: wiki("On_the_Origin_of_Species"),
  },
  {
    id: "telephone",
    year: 1876,
    title: "Telephone patented",
    description:
      "Alexander Graham Bell patents the telephone.",
    significance: 0.55,
    wikipediaUrl: wiki("Invention_of_the_telephone"),
  },
  {
    id: "wright-flight",
    year: 1903,
    title: "First powered flight",
    description:
      "The Wright brothers achieve the first powered, controlled airplane flight.",
    significance: 0.6,
    wikipediaUrl: wiki("Wright_brothers"),
  },
  {
    id: "einstein-relativity",
    year: 1905,
    title: "Einstein's annus mirabilis",
    description:
      "Albert Einstein publishes his special theory of relativity and other landmark papers.",
    significance: 0.76,
    wikipediaUrl: wiki("Annus_mirabilis_papers"),
  },
  {
    id: "world-war-i",
    year: 1914,
    title: "World War I begins",
    description:
      "The assassination of Archduke Franz Ferdinand leads to a global war.",
    significance: 0.82,
    wikipediaUrl: wiki("World_War_I"),
  },
  {
    id: "penicillin",
    year: 1928,
    title: "Discovery of penicillin",
    description:
      "Alexander Fleming discovers penicillin, ushering in the antibiotic era.",
    significance: 0.6,
    wikipediaUrl: wiki("Penicillin"),
  },
  {
    id: "world-war-ii",
    year: 1939,
    title: "World War II begins",
    description:
      "Germany invades Poland, beginning the deadliest conflict in history.",
    significance: 0.94,
    wikipediaUrl: wiki("World_War_II"),
  },
  {
    id: "dna-structure",
    year: 1953,
    title: "DNA structure discovered",
    description:
      "Watson and Crick describe the double-helix structure of DNA.",
    significance: 0.68,
    wikipediaUrl: wiki("DNA"),
  },
  {
    id: "sputnik",
    year: 1957,
    title: "Sputnik launched",
    description:
      "The Soviet Union launches Sputnik 1, the first artificial satellite.",
    significance: 0.7,
    wikipediaUrl: wiki("Sputnik_1"),
  },
  {
    id: "mlk-dream",
    year: 1963,
    title: "\u201cI Have a Dream\u201d speech",
    description:
      "Martin Luther King Jr. delivers his landmark speech at the March on Washington.",
    significance: 0.58,
    wikipediaUrl: wiki("I_Have_a_Dream"),
  },
  {
    id: "moon-landing",
    year: 1969,
    title: "Apollo 11 Moon landing",
    description:
      "Humans first set foot on the Moon, a defining moment of the Space Age.",
    significance: 0.97,
    wikipediaUrl: wiki("Apollo_11"),
  },
  {
    id: "berlin-wall",
    year: 1989,
    title: "Fall of the Berlin Wall",
    description:
      "The Berlin Wall falls, hastening the end of the Cold War.",
    significance: 0.7,
    wikipediaUrl: wiki("Berlin_Wall"),
  },
  {
    id: "world-wide-web",
    year: 1989,
    title: "World Wide Web invented",
    description:
      "Tim Berners-Lee proposes the World Wide Web, transforming communication.",
    significance: 0.78,
    wikipediaUrl: wiki("World_Wide_Web"),
  },
  {
    id: "september-11",
    year: 2001,
    title: "September 11 attacks",
    description:
      "Coordinated attacks on the United States reshape global politics.",
    significance: 0.86,
    wikipediaUrl: wiki("September_11_attacks"),
  },
  {
    id: "covid-pandemic",
    year: 2020,
    title: "COVID-19 pandemic",
    description:
      "A novel coronavirus spreads worldwide, upending daily life and economies.",
    significance: 0.9,
    wikipediaUrl: wiki("COVID-19_pandemic"),
  },
];
