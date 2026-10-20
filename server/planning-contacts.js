import { contactFromOverride, findContact, mergeContactOverride } from "./contacts.js";

// Resolve only this owner's overrides; imported contacts are shared source data.
export async function planningContacts(query, userId, ids, { validate = false } = {}) {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  // Match the career contacts access gate, including imported source contacts.
  const access = await query("SELECT user_id FROM default_follow_targets WHERE user_id=$1", [userId]);
  if (!access.rows.length) {
    if (validate) throw Object.assign(new Error("Раздел контактов недоступен"), { planningStatus: 403 });
    return [];
  }
  const result = await query("SELECT * FROM contact_overrides WHERE user_id=$1 AND contact_id=ANY($2::text[])", [userId, unique]);
  const overrides = new Map(result.rows.map((row) => [row.contact_id, row]));
  return unique.flatMap((id) => {
    const override = overrides.get(id);
    const source = findContact(id);
    const contact = source ? mergeContactOverride(source, override) : contactFromOverride(override);
    if (!contact || contact.deletedAt) {
      if (validate) throw Object.assign(new Error("Контакт недоступен. Удалите его из участников и выберите заново."), { planningStatus: 400 });
      return [];
    }
    return [{ id, name: contact.name, company: contact.company }];
  });
}

export async function withPlanningContacts(query, userId, tasks) {
  const contacts = await planningContacts(query, userId, tasks.flatMap((task) => task.contactIds || []));
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  return tasks.map((task) => ({ ...task, contactIds: task.contactIds || [], contacts: (task.contactIds || []).map((id) => byId.get(id)).filter(Boolean) }));
}

export async function contactMeetingNotes(query, userId, contactId) {
  const result = await query(`SELECT id,title,description,to_char(due_on, 'YYYY-MM-DD') AS "dueOn",
      to_char(start_time, 'HH24:MI') AS "startTime"
    FROM planning_tasks WHERE user_id=$1 AND contact_ids ? $2 AND btrim(description)<>''
    ORDER BY due_on DESC NULLS LAST,created_at DESC,id`, [userId, contactId]);
  return result.rows;
}
