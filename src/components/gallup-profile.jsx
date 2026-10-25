import { IdentityGeneratedDocuments, IdentityReportEmpty, IdentityReportStatus } from "@/components/identity-report-manager";

function GeneratedGallupProfile({ report }) {
  return <IdentityGeneratedDocuments report={report} />;
}

export function GallupProfile({ reportState: { state, error, load } }) {
  if (state.mode === "loading" || state.mode === "error") {
    return <IdentityReportStatus mode={state.mode} error={error} onRetry={load} />;
  }
  return state.mode === "generated"
    ? <GeneratedGallupProfile report={state.report} />
    : <IdentityReportEmpty label="Gallup" />;
}
