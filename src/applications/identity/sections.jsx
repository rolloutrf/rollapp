import { CharacterTraits } from "@/modules/identity/character-traits.jsx";
import { EditableLifeStrategy } from "@/modules/identity/editable-life-strategy.jsx";
import { FourQuestions } from "@/modules/identity/four-questions.jsx";
import { GallupProfile } from "@/modules/identity/gallup-profile.jsx";
import { IdealState } from "@/modules/identity/ideal-state.jsx";
import { IdentityGeneratedDocuments, IdentityReportEmpty, IdentityReportStatus } from "@/modules/identity/identity-report-manager.jsx";
import { IdentityReportsPage } from "@/modules/identity/identity-reports-page.jsx";
import { Mission } from "@/modules/identity/mission.jsx";
import { PersonalDevelopmentPlan } from "@/modules/identity/personal-development-plan.jsx";
import { Principles, Theses } from "@/modules/identity/theses.jsx";
import { Values } from "@/modules/identity/values.jsx";

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
