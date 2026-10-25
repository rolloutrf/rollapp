import { useEffect, useState } from "react";
import { migrateDevelopmentPlanDraft } from "@/lib/development-plan";
import { InlineDocument } from "@/components/inline-document";
import { CareerContentError, useCareerContent } from "@/components/career-content";
import { useSphereSharing } from "@/lib/sphere-sharing";

const DEVELOPMENT_PLAN_SOURCE = "";

export function DevelopmentPlan() {
  const sharing = useSphereSharing();
  const [draftOwner, setDraftOwner] = useState(null);
  const ownerKey = sharing.owner?.id || "self";
  useEffect(() => {
    if (sharing.loading) return;
    try {
      if (sharing.owner?.id) migrateDevelopmentPlanDraft(sessionStorage, `rollapp:text:${sharing.owner.id}:career:development`);
    } catch { /* Storage restrictions must not prevent loading the document. */ }
    setDraftOwner(ownerKey);
  }, [ownerKey, sharing.loading, sharing.owner?.id]);
  const careerContent = useCareerContent("development", DEVELOPMENT_PLAN_SOURCE);
  const content = typeof careerContent.content === "string" ? careerContent.content : DEVELOPMENT_PLAN_SOURCE;

  return (
    <div className="sphere-text-page page-stack">
      <CareerContentError error={careerContent.error} onRetry={careerContent.retry} />
      {careerContent.loading && <span className="not-typeset text-muted-foreground" role="status">Загружаем…</span>}
      {!careerContent.loading && !careerContent.error && draftOwner === ownerKey && (
        <InlineDocument
          key={`career:development:${sharing.owner?.id || "self"}`}
          documentKey="career:development"
          scope="career"
          value={content}
          onSave={careerContent.save}
          label="Индивидуальный план развития"
          placeholder="Начните писать или введите / для выбора блока"
          readOnly={sharing.readOnly}
          disabled={sharing.loading || Boolean(sharing.error)}
          showBusinessControls={false}
        />
      )}
    </div>
  );
}
