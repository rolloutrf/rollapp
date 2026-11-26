package ru.rollapp.android

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

private enum class PlanningView(val kind: String, val label: String) {
    Notes("notes", "Заметки"), Board("kanban", "Kanban-доска"),
    CalendarView("calendar", "Календарь"), Todo("todo", "To Do на каждый день"),
}

private fun dayParser() = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply {
    isLenient = false
    timeZone = TimeZone.getTimeZone("UTC")
}

@Composable
internal fun PlanningScreen(credential: NativeCredential, layout: CollectionLayout, onBack: () -> Unit) {
    var view by rememberSaveable { mutableStateOf(PlanningView.Board) }
    key(view) { PlanningViewScreen(view, credential, layout, { view = it }, onBack) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PlanningViewScreen(
    view: PlanningView, credential: NativeCredential, layout: CollectionLayout,
    setView: (PlanningView) -> Unit, onBack: () -> Unit,
) {
    val notes = view == PlanningView.Notes
    val dated = view == PlanningView.Todo || view == PlanningView.CalendarView
    val locale = Locale.forLanguageTag("ru-RU")
    var day by rememberSaveable {
        mutableStateOf(SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(java.util.Date()))
    }
    var choosingDate by remember { mutableStateOf(false) }
    var space by rememberSaveable { mutableStateOf("main") }
    var revision by remember { mutableIntStateOf(0) }
    var editId by rememberSaveable { mutableStateOf<String?>(null) }
    val operation = rememberNativeMutation()
    val base = if (notes) "/api/planning/notes" else "/api/planning/tasks"
    val query = if (notes) "" else "?space=${segment(space)}"
    val data by nativeData(base + query, credential, revision)
    val spaces = if (notes) null else nativeData("/api/planning/spaces?kind=${view.kind}", credential, revision).value
    val options = (spaces as? NativeData.Ready)?.value?.rows("spaces").orEmpty()
    val snapshot = (data as? NativeData.Ready)?.value
    val columns = snapshot?.rows("columns").orEmpty()
    val rows = snapshot?.rows(if (notes) "notes" else "tasks").orEmpty()
    val editing = editId
    if (editing != null && snapshot != null) {
        val item = rows.find { it.cleanString("id") == editing }
        if (item != null || editing.isEmpty()) {
            PlanningEditor(
                notes, item, columns, day.takeIf { dated }, base, query,
                credential, layout, { editId = null }, onSaved = { editId = null; revision++ },
            )
        } else {
            NativePage(layout) { NativeMessage("Элемент больше недоступен."); TextButton(onClick = { editId = null }) { Text("Назад") } }
        }
        return
    }

    fun shiftDate(offset: Int) {
        val current = dayParser().parse(day) ?: return
        val next = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { time = current; add(Calendar.DAY_OF_MONTH, offset) }
        day = dayParser().format(next.time)
    }

    NativePage(layout, maxWidth = 1024.dp, footer = {
        Row(horizontalArrangement = Arrangement.spacedBy(ControlGap), verticalAlignment = Alignment.CenterVertically) {
            ChromeIconButton(Icons.AutoMirrored.Filled.ArrowBack, "Назад", onBack)
            var selectingSpace by remember { mutableStateOf(false) }
            var selectingView by remember { mutableStateOf(false) }
            Box(Modifier.weight(1f)) {
                OutlinedButton(
                    onClick = { selectingSpace = true }, enabled = options.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth().heightIn(min = ControlSize),
                ) {
                    Text(options.find { it.cleanString("id") == space }?.cleanString("title") ?: view.label,
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                DropdownMenu(selectingSpace, onDismissRequest = { selectingSpace = false }) {
                    options.forEach {
                        DropdownMenuItem(text = { Text(it.cleanString("title")) }, onClick = {
                            space = it.getString("id")
                            selectingSpace = false
                        })
                    }
                }
            }
            Box {
                ChromeIconButton(Icons.Default.DateRange, "Открыть планирование", { selectingView = true })
                DropdownMenu(selectingView, onDismissRequest = { selectingView = false }) {
                    PlanningView.entries.forEach { option ->
                        DropdownMenuItem(text = { Text(option.label) }, onClick = { selectingView = false; setView(option) })
                    }
                }
            }
        }
    }) {
        NativeTitle(view.label)
        if (dated) {
            Row(horizontalArrangement = Arrangement.spacedBy(ControlGap), verticalAlignment = Alignment.CenterVertically) {
                ChromeIconButton(Icons.Default.KeyboardArrowLeft, "Предыдущий день", { shiftDate(-1) })
                OutlinedButton(onClick = { choosingDate = true }, modifier = Modifier.weight(1f).heightIn(min = ControlSize)) {
                    val stamp = dayParser().parse(day)
                    val format = SimpleDateFormat("d MMMM, EEE", locale).apply { timeZone = TimeZone.getTimeZone("UTC") }
                    Text(stamp?.let(format::format) ?: day, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                ChromeIconButton(Icons.Default.KeyboardArrowRight, "Следующий день", { shiftDate(1) })
                if (snapshot != null) ChromeIconButton(Icons.Default.Add, "Добавить", { editId = "" })
            }
        } else if (snapshot != null) {
            Button(onClick = { editId = "" }, modifier = Modifier.heightIn(min = ControlSize)) {
                Text(if (notes) "Новая заметка" else "Добавить")
            }
        }
        operation.error?.let { NativeMessage(it, error = true) }
        DataContent(data, { revision++ }) {
            val active = rows.filter { !it.optBoolean("archived") }
            val filtered = if (dated) active.filter { it.cleanString("dueOn") == day } else active
            val groups = if (view == PlanningView.Board) columns.map { column ->
                column.cleanString("title") to filtered.filter { task -> task.cleanString("columnId") == column.getString("id") }
            } else listOf("" to filtered)
            if (filtered.isEmpty() && view != PlanningView.Board) NativeMessage(if (notes) "Заметок пока нет" else "Задач пока нет")
            groups.forEach { (heading, entries) ->
                Column(verticalArrangement = Arrangement.spacedBy(ControlGap)) {
                    if (heading.isNotBlank()) Text(heading, style = MaterialTheme.typography.titleLarge)
                    entries.forEach { entry ->
                        val id = entry.getString("id")
                        Surface(
                            onClick = { editId = id }, enabled = !operation.busy,
                            modifier = Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.surfaceContainer,
                            shape = RoundedCornerShape(18.dp),
                        ) {
                            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                if (!notes) Checkbox(
                                    checked = entry.optBoolean("completed"), enabled = !operation.busy && operation.error == null,
                                    onCheckedChange = { checked ->
                                        operation.run {
                                            credential.request("$base/${segment(id)}$query", JSONObject().put("completed", checked), "PATCH")
                                            revision++
                                        }
                                    },
                                )
                                Column(Modifier.weight(1f)) {
                                    Text(entry.cleanString("title"))
                                    val time = entry.cleanString("startTime")
                                    if (time.isNotBlank()) NativeMessage(time)
                                }
                            }
                        }
                    }
                }
            }
            if (operation.error != null) OutlinedButton(onClick = { operation.clear(); revision++ }) { Text("Обновить список") }
        }
    }

    if (choosingDate) {
        val picker = rememberDatePickerState(initialSelectedDateMillis = dayParser().parse(day)?.time)
        DatePickerDialog(
            onDismissRequest = { choosingDate = false },
            confirmButton = {
                TextButton(onClick = {
                    picker.selectedDateMillis?.let { day = dayParser().format(java.util.Date(it)) }
                    choosingDate = false
                }) { Text("Выбрать") }
            },
            dismissButton = { TextButton(onClick = { choosingDate = false }) { Text("Назад") } },
        ) { DatePicker(picker, showModeToggle = false) }
    }
}

@Composable
private fun PlanningEditor(
    notes: Boolean, item: JSONObject?, columns: List<JSONObject>, day: String?,
    base: String, query: String, credential: NativeCredential, layout: CollectionLayout, onBack: () -> Unit, onSaved: () -> Unit,
) {
    val id = item?.cleanString("id")
    var title by rememberSaveable(id) { mutableStateOf(item?.cleanString("title").orEmpty()) }
    // Long documents can exceed Android's saved-state transaction limit.
    var content by remember(id) { mutableStateOf(item?.cleanString(if (notes) "content" else "description").orEmpty()) }
    var expected by rememberSaveable(id) { mutableStateOf(item?.cleanString("expectedResult").orEmpty()) }
    var actual by rememberSaveable(id) { mutableStateOf(item?.cleanString("actualResult").orEmpty()) }
    var columnId by rememberSaveable(id) {
        mutableStateOf(item?.cleanString("columnId") ?: columns.firstOrNull { !it.optBoolean("complete") }?.cleanString("id").orEmpty())
    }
    val operation = rememberNativeMutation()
    val cancel = { if (!operation.busy) onBack() }
    BackHandler(onBack = cancel)
    NativePage(layout, maxWidth = 576.dp, footer = {
        NativeFooter(cancel, "Сохранить", (notes || title.isNotBlank()) && !operation.busy, {
            operation.run {
                val payload = JSONObject().put("title", title.trim())
                if (notes) payload.put("content", content) else {
                    payload.put("description", content).put("expectedResult", expected).put("actualResult", actual)
                    if (id == null && day != null) payload.put("dueOn", day)
                    if (columnId.isNotBlank() && columnId != item?.cleanString("columnId")) payload.put("columnId", columnId)
                }
                val resource = if (id == null) base else "$base/${segment(id)}"
                credential.request(resource + query, payload, if (id == null) "POST" else "PATCH")
                onSaved()
            }
        })
    }) {
        NativeTitle(if (notes) if (id == null) "Новая заметка" else "Заметка" else if (id == null) "Новая задача" else "Задача")
        FormField(title, { title = it }, "Название", 200, enabled = !operation.busy)
        FormField(content, { content = it }, if (notes) "Текст заметки" else "Описание", if (notes) 200000 else 5000, 4, !operation.busy)
        if (!notes) {
            FormField(expected, { expected = it }, "Ожидаемый результат", 5000, 2, !operation.busy)
            FormField(actual, { actual = it }, "Факт", 5000, 2, !operation.busy)
            var selectColumn by remember { mutableStateOf(false) }
            Box {
                OutlinedButton(onClick = { selectColumn = true }, enabled = columns.isNotEmpty() && !operation.busy) {
                    Text(columns.find { it.cleanString("id") == columnId }?.cleanString("title") ?: "Список")
                }
                DropdownMenu(selectColumn, onDismissRequest = { selectColumn = false }) {
                    columns.forEach { column ->
                        DropdownMenuItem(text = { Text(column.cleanString("title")) }, onClick = {
                            columnId = column.getString("id")
                            selectColumn = false
                        })
                    }
                }
            }
        }
        operation.error?.let { NativeMessage(it, error = true) }
    }
}
