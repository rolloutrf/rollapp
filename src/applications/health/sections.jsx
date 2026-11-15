import { HeartPulse } from "lucide-react";
import { HealthTracker } from "@/components/health-tracker";
import { LabResults } from "@/components/lab-results";
import { Medications } from "@/components/medications";
import { Workouts } from "@/components/workouts";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

const sections = {
  "lab-results": LabResults,
  medications: Medications,
  sport: Workouts,
};

export default function HealthSection({ tab }) {
  if (tab.id === "sleep" || tab.id === "nutrition") return <HealthTracker key={tab.id} tracker={tab.id} />;
  const Section = sections[tab.id];
  if (Section) return <Section />;
  return (
    <Empty className="min-h-64 border" aria-labelledby={`health-tab-${tab.id}`}>
      <EmptyHeader>
        <EmptyMedia variant="icon"><HeartPulse aria-hidden="true" /></EmptyMedia>
        <EmptyTitle><h2 id={`health-tab-${tab.id}`} className="m-0! text-lg! leading-7! font-semibold!">{tab.label}</h2></EmptyTitle>
        <EmptyDescription>{tab.description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent><Badge variant="secondary">Скоро</Badge></EmptyContent>
    </Empty>
  );
}
