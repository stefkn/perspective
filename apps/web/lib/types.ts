export interface TimelineEvent {
  id: string;
  year: number;
  title: string;
  description: string;
  significance: number;
  wikipediaUrl: string | null;
}
