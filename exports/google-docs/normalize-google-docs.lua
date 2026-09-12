local stringify = pandoc.utils.stringify

function RawBlock(block)
  if block.format ~= "html" then
    return nil
  end

  local source = block.text:match('src="([^"]+)"')
  if source and block.text:match("<iframe") then
    return pandoc.Para({
      pandoc.Str("Видеолекция: "),
      pandoc.Link("открыть видеоплеер", source),
    })
  end

  if block.text:match("</iframe>") then
    return {}
  end

  return nil
end

function Pandoc(document)
  local blocks = pandoc.List()
  local skip_contents_paragraph = false

  for _, block in ipairs(document.blocks) do
    if block.t == "Header"
      and block.level == 2
      and stringify(block.content) == "Содержание" then
      skip_contents_paragraph = true
    elseif skip_contents_paragraph and block.t == "Para" then
      skip_contents_paragraph = false
    else
      blocks:insert(block)
    end
  end

  document.blocks = blocks
  return document
end
