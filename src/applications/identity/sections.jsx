import { CharacterTraits } from "@/components/character-traits";
import { EditableLifeStrategy } from "@/components/editable-life-strategy";
import { FourQuestions } from "@/components/four-questions";
import { GallupProfile } from "@/components/gallup-profile";
import { IdealState } from "@/components/ideal-state";
import { IdentityGeneratedDocuments, IdentityReportEmpty, IdentityReportStatus } from "@/components/identity-report-manager";
import { IdentityReportsPage } from "@/components/identity-reports-page";
import { Mission } from "@/components/mission";
import { PersonalDevelopmentPlan } from "@/components/personal-development-plan";
import { Principles, Theses } from "@/components/theses";
import { Values } from "@/components/values";

function HoganReport({ reportState: { state, error, load } }) {
  if (state.mode === "loading" || state.mode === "error") {
    return <IdentityReportStatus mode={state.mode} error={error} onRetry={load} />;
  }
  return state.mode === "generated"
    ? <IdentityGeneratedDocuments report={state.report} />
    : <IdentityReportEmpty label="Hogan" />;
}

function Reports() {
  return <IdentityReportsPage
    renderGallup={reportState => <GallupProfile reportState={reportState} />}
    renderHogan={reportState => <HoganReport reportState={reportState} />}
  />;
}

const sections = {
  "four-questions": FourQuestions,
  theses: Theses,
  principles: Principles,
  "identity-reports": Reports,
  values: Values,
  character: CharacterTraits,
  mission: Mission,
  "ideal-state": IdealState,
  "personal-development-plan": PersonalDevelopmentPlan,
  "life-strategy": EditableLifeStrategy,
};

export default function IdentitySection({ tab }) {
  const Section = sections[tab.id];
  return <Section />;
}
