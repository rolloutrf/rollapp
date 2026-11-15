// Schema-only block constructors shared by commands and insertion.
export function createBlockNode(schema, id, attrs) {
  const paragraph = schema.nodes.paragraph.create();
  if (id.startsWith("heading")) return schema.nodes.heading.create({ level: Number(id.slice(-1)) });
  if (id === "bulletList" || id === "orderedList") return schema.nodes[id].create(null, schema.nodes.listItem.create(null, paragraph));
  if (id === "taskList") return schema.nodes.taskList.create(null, schema.nodes.taskItem.create({ checked: false }, paragraph));
  if (id === "details") return schema.nodes.details.create({ open: true }, [schema.nodes.detailsSummary.create(), schema.nodes.detailsContent.create(null, paragraph)]);
  if (id === "blockquote") return schema.nodes.blockquote.create(null, paragraph);
  if (id === "codeBlock" || id === "horizontalRule") return schema.nodes[id].create();
  if (id === "image") return schema.nodes.image.create(attrs);
  if (id === "columns") return schema.nodes.columns.create(null, [schema.nodes.column.create(null, paragraph), schema.nodes.column.create(null, paragraph)]);
  if (id === "table") return schema.nodes.table.create(null, Array.from({ length: 3 }, (_, row) => schema.nodes.tableRow.create(null,
    Array.from({ length: 3 }, () => schema.nodes[row === 0 ? "tableHeader" : "tableCell"].create(null, schema.nodes.paragraph.create())))));
  return paragraph;
}
