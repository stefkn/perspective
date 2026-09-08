import { NOW } from "./time-transform";
import type { Interval } from "./lanes";

export interface CulturalWork extends Interval {}

// Famous works of culture across history: art, architecture, literature,
// music and film. Spans mark the work's creation or construction window;
// single-year works get a one-year window so they render as short bands.
// `estimated` flags works whose dates are scholarly approximations rather
// than firmly dated. Negative years are BCE.
export const CULTURE: CulturalWork[] = [
  // Architecture
  { id: "stonehenge", title: "Stonehenge", startYear: -3000, endYear: -2000, estimated: true },
  { id: "ziggurat-ur", title: "Great Ziggurat of Ur", startYear: -2100, endYear: -2000, estimated: true },
  { id: "parthenon", title: "Parthenon", startYear: -447, endYear: -432 },
  { id: "great-wall", title: "Great Wall of China", startYear: -220, endYear: -206 },
  { id: "colosseum", title: "Colosseum", startYear: 70, endYear: 80 },
  { id: "pantheon", title: "Pantheon", startYear: 113, endYear: 125 },
  { id: "hagia-sophia", title: "Hagia Sophia", startYear: 532, endYear: 537 },
  { id: "notre-dame", title: "Notre-Dame de Paris", startYear: 1163, endYear: 1345 },
  { id: "chartres", title: "Chartres Cathedral", startYear: 1194, endYear: 1220 },
  { id: "taj-mahal", title: "Taj Mahal", startYear: 1632, endYear: 1653 },
  { id: "eiffel-tower", title: "Eiffel Tower", startYear: 1887, endYear: 1889 },
  { id: "sagrada-familia", title: "Sagrada Família", startYear: 1882, endYear: NOW },
  { id: "empire-state", title: "Empire State Building", startYear: 1930, endYear: 1931 },
  { id: "sydney-opera-house", title: "Sydney Opera House", startYear: 1959, endYear: 1973 },

  // Visual art
  { id: "bust-nefertiti", title: "Bust of Nefertiti", startYear: -1345, endYear: -1340, estimated: true },
  { id: "terracotta-army", title: "Terracotta Army", startYear: -246, endYear: -208 },
  { id: "laocoon", title: "Laocoön and His Sons", startYear: -40, endYear: -20, estimated: true },
  { id: "bayeux-tapestry", title: "Bayeux Tapestry", startYear: 1070, endYear: 1080, estimated: true },
  { id: "scrovegni", title: "Scrovegni Chapel frescoes", startYear: 1303, endYear: 1305 },
  { id: "arnolfini", title: "Arnolfini Portrait", startYear: 1434, endYear: 1435 },
  { id: "david", title: "Michelangelo's David", startYear: 1501, endYear: 1504 },
  { id: "mona-lisa", title: "Mona Lisa", startYear: 1503, endYear: 1506 },
  { id: "sistine-ceiling", title: "Sistine Chapel ceiling", startYear: 1508, endYear: 1512 },
  { id: "school-athens", title: "The School of Athens", startYear: 1509, endYear: 1511 },
  { id: "night-watch", title: "The Night Watch", startYear: 1640, endYear: 1642 },
  { id: "girl-pearl-earring", title: "Girl with a Pearl Earring", startYear: 1665, endYear: 1666, estimated: true },
  { id: "great-wave", title: "The Great Wave off Kanagawa", startYear: 1830, endYear: 1832, estimated: true },
  { id: "starry-night", title: "The Starry Night", startYear: 1888, endYear: 1889 },
  { id: "the-scream", title: "The Scream", startYear: 1893, endYear: 1894 },
  { id: "demoiselles-avignon", title: "Les Demoiselles d'Avignon", startYear: 1907, endYear: 1908 },
  { id: "fountain", title: "Fountain", startYear: 1917, endYear: 1918 },
  { id: "guernica", title: "Guernica", startYear: 1937, endYear: 1938 },
  { id: "campbells-soup", title: "Campbell's Soup Cans", startYear: 1961, endYear: 1962 },

  // Literature
  { id: "gilgamesh", title: "Epic of Gilgamesh", startYear: -2100, endYear: -1200, estimated: true },
  { id: "iliad", title: "The Iliad", startYear: -760, endYear: -710, estimated: true },
  { id: "odyssey", title: "The Odyssey", startYear: -725, endYear: -675, estimated: true },
  { id: "analects", title: "Analects", startYear: -475, endYear: -221, estimated: true },
  { id: "art-of-war", title: "The Art of War", startYear: -500, endYear: -400, estimated: true },
  { id: "aeneid", title: "Aeneid", startYear: -29, endYear: -19 },
  { id: "metamorphoses", title: "Metamorphoses", startYear: 2, endYear: 8, estimated: true },
  { id: "beowulf", title: "Beowulf", startYear: 975, endYear: 1025, estimated: true },
  { id: "tale-of-genji", title: "The Tale of Genji", startYear: 1000, endYear: 1012, estimated: true },
  { id: "divine-comedy", title: "Divine Comedy", startYear: 1308, endYear: 1321 },
  { id: "canterbury-tales", title: "The Canterbury Tales", startYear: 1387, endYear: 1400 },
  { id: "don-quixote", title: "Don Quixote", startYear: 1605, endYear: 1615 },
  { id: "hamlet", title: "Hamlet", startYear: 1599, endYear: 1601 },
  { id: "paradise-lost", title: "Paradise Lost", startYear: 1658, endYear: 1667 },
  { id: "pride-and-prejudice", title: "Pride and Prejudice", startYear: 1796, endYear: 1813 },
  { id: "frankenstein", title: "Frankenstein", startYear: 1816, endYear: 1818 },
  { id: "moby-dick", title: "Moby-Dick", startYear: 1850, endYear: 1851 },
  { id: "crime-and-punishment", title: "Crime and Punishment", startYear: 1865, endYear: 1866 },
  { id: "war-and-peace", title: "War and Peace", startYear: 1863, endYear: 1869 },
  { id: "ulysses", title: "Ulysses", startYear: 1914, endYear: 1922 },
  { id: "great-gatsby", title: "The Great Gatsby", startYear: 1924, endYear: 1925 },
  { id: "hundred-years-solitude", title: "One Hundred Years of Solitude", startYear: 1965, endYear: 1967 },

  // Music
  { id: "messiah", title: "Messiah", startYear: 1741, endYear: 1742 },
  { id: "mass-in-b-minor", title: "Mass in B minor", startYear: 1724, endYear: 1749 },
  { id: "mozart-requiem", title: "Requiem", startYear: 1791, endYear: 1792 },
  { id: "symphony-9", title: "Symphony No. 9", startYear: 1822, endYear: 1824 },
  { id: "winterreise", title: "Winterreise", startYear: 1827, endYear: 1828 },
  { id: "ring-cycle", title: "Der Ring des Nibelungen", startYear: 1848, endYear: 1874 },
  { id: "rite-of-spring", title: "The Rite of Spring", startYear: 1911, endYear: 1913 },
  { id: "west-end-blues", title: "West End Blues", startYear: 1928, endYear: 1929 },
  { id: "kind-of-blue", title: "Kind of Blue", startYear: 1959, endYear: 1960 },
  { id: "like-a-rolling-stone", title: "Like a Rolling Stone", startYear: 1965, endYear: 1966 },
  { id: "sgt-pepper", title: "Sgt. Pepper's Lonely Hearts Club Band", startYear: 1966, endYear: 1967 },
  { id: "thriller", title: "Thriller", startYear: 1982, endYear: 1983 },

  // Film
  { id: "metropolis", title: "Metropolis", startYear: 1925, endYear: 1927 },
  { id: "citizen-kane", title: "Citizen Kane", startYear: 1941, endYear: 1942 },
  { id: "casablanca", title: "Casablanca", startYear: 1942, endYear: 1943 },
  { id: "space-odyssey", title: "2001: A Space Odyssey", startYear: 1964, endYear: 1968 },
  { id: "star-wars", title: "Star Wars", startYear: 1976, endYear: 1977 },
];
