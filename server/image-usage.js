// A shared media URL can occur in prose as Markdown or canonical block HTML.
// Keep it alive when profile/course cleanup asks to remove the same asset.
// These are existing tables; checking references never initializes a schema.
const referenceQueries = [
  "SELECT 1 FROM health_medications WHERE user_id=$1 AND image_url=$2 LIMIT 1",
  "SELECT 1 FROM wishes WHERE user_id=$1 AND image_url=$2 LIMIT 1",
  "SELECT 1 FROM users WHERE id=$1 AND avatar_url=$2 LIMIT 1",
  "SELECT 1 FROM education_courses WHERE user_id=$1 AND logo_url=$2 LIMIT 1",
  "SELECT 1 FROM education_conferences WHERE user_id=$1 AND logo_url=$2 LIMIT 1",
  "SELECT 1 FROM contact_overrides WHERE user_id=$1 AND avatar_url=$2 LIMIT 1",
  "SELECT 1 FROM career_content WHERE user_id=$1 AND POSITION($2 IN content_json)>0 LIMIT 1",
  "SELECT 1 FROM identity_content WHERE user_id=$1 AND POSITION($2 IN content_json)>0 LIMIT 1",
  "SELECT 1 FROM planning_notes WHERE user_id=$1 AND POSITION($2 IN content)>0 LIMIT 1",
];

export async function imageIsInUse(query, userId, imageUrl) {
  const results = await Promise.all(referenceQueries.map(sql => query(sql, [userId, imageUrl])));
  return results.some(result => result.rowCount > 0);
}
