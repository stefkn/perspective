import { NOW } from "./time-transform";
import type { Interval } from "./lanes";

export interface Power extends Interval {}

// Major world powers, curated for legibility (start/end years are
// approximations of each polity's period of global dominance).
export const POWERS: Power[] = [
  { id: "achaemenid", title: "Achaemenid Empire", startYear: -550, endYear: -330 },
  { id: "han", title: "Han dynasty", startYear: -202, endYear: 220 },
  { id: "roman", title: "Roman Empire", startYear: -27, endYear: 476 },
  { id: "byzantine", title: "Byzantine Empire", startYear: 330, endYear: 1453 },
  { id: "tang", title: "Tang dynasty", startYear: 618, endYear: 907 },
  { id: "abbasid", title: "Abbasid Caliphate", startYear: 750, endYear: 1258 },
  { id: "mongol", title: "Mongol Empire", startYear: 1206, endYear: 1368 },
  { id: "ottoman", title: "Ottoman Empire", startYear: 1299, endYear: 1922 },
  { id: "spanish", title: "Spanish Empire", startYear: 1492, endYear: 1898 },
  { id: "qing", title: "Qing dynasty", startYear: 1644, endYear: 1912 },
  { id: "russian", title: "Russian Empire", startYear: 1721, endYear: 1917 },
  { id: "british", title: "British Empire", startYear: 1815, endYear: 1945 },
  { id: "soviet", title: "Soviet Union", startYear: 1922, endYear: 1991 },
  { id: "usa", title: "United States", startYear: 1945, endYear: NOW },
];
