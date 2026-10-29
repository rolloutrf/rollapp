export function registerPrivateFiles(app, { query, requireAuth, asyncRoute }) {
  // Archive access always uses the session owner, never a shared-profile query.
  const ownArchive = (req, res, next) => {
    if (req.query.owner) return res.status(403).json({ error: "Архив доступен только владельцу аккаунта" });
    next();
  };
  app.get("/api/me/private-files", requireAuth, ownArchive, asyncRoute(async (req, res) => {
    const result = await query("SELECT id,source_path AS path,filename,mime_type AS \"mimeType\",size_bytes AS \"sizeBytes\",file_sha256 AS sha256,created_at AS \"createdAt\" FROM private_files WHERE user_id=$1 ORDER BY created_at,id", [req.user.id]);
    res.set("Cache-Control", "private, no-store");
    res.json({ files: result.rows });
  }));
  app.get("/api/me/private-files/:id", requireAuth, ownArchive, asyncRoute(async (req, res) => {
    const result = await query("SELECT filename,mime_type,file_data,size_bytes FROM private_files WHERE user_id=$1 AND id=$2", [req.user.id, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Файл не найден" });
    const file = result.rows[0];
    res.set({ "Cache-Control": "private, no-store", "Content-Length": String(file.size_bytes), "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename).replaceAll("'", "%27")}`, "X-Content-Type-Options": "nosniff" });
    return res.type(file.mime_type).send(file.file_data);
  }));
}
