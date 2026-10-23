import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MedicationDrawer, MedicationCard } from "@/components/medications.jsx?medication-photo-fixture";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { SphereSharingContext } from "@/lib/sphere-sharing";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { Button } from "@/components/ui/button";
import "../../src/styles.css";
import "../../src/index.css";
const original = { id: "photo-test", name: "Витамин Е — IPSUM, 60 капсул", medicationForm: "capsule", status: "planned", dosage: "", frequency: "custom", scheduleTimes: [], purpose: "", prescriber: "", instructions: "", notes: "Фото упаковки", startOn: "", endOn: "", imageUrl: `${location.origin}/__medication-photo.png` };
window.medicationPhotoCalls = [];
window.medicationPhotoTransport = {
  async patch(path, data) {
    window.medicationPhotoCalls.push({ method: "patch", path, data });
    if (window.failMedicationSave) { window.failMedicationSave = false; throw new Error("Не удалось сохранить: повторите"); }
    return { medication: { ...data, id: original.id } };
  },
  async uploadImage(file) {
    window.medicationPhotoCalls.push({ method: "upload", type: file.type, size: file.size });
    if (window.deferMedicationUpload) await new Promise(resolve => { window.resolveMedicationUpload = resolve; });
    return { id: "11111111-1111-4111-8111-111111111111", imageUrl: "/api/media/11111111-1111-4111-8111-111111111111" };
  },
  async delete(path) { window.medicationPhotoCalls.push({ method: "delete", path }); },
};
function Fixture() {
  useVisualViewport();
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState(original);
  const readonly = new URLSearchParams(location.search).has("readonly");
  window.closeMedicationOwner = () => setOpen(false);
  return <SphereSharingContext.Provider value={{ readOnly: readonly }}><MobileFormPages>
    <main className="app-page rollapp-body page-stack">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4"><MedicationCard groups={[]} medication={item} onEdit={() => !readonly && setOpen(true)} /></div>
      {!readonly && <Button onClick={() => setOpen(true)}>Открыть форму</Button>}
      {!readonly && <MedicationDrawer open={open} medication={item} groups={[]} onOpenChange={setOpen} onSaved={setItem} />}
    </main>
  </MobileFormPages></SphereSharingContext.Provider>;
}
createRoot(document.getElementById("root")).render(<BrowserRouter><Fixture /></BrowserRouter>);
