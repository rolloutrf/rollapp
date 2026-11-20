package ru.rollapp.android

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

internal fun parseTimestamp(value: String): Date? = runCatching {
    if (value.length != 24) null else java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT).apply {
        timeZone = java.util.TimeZone.getTimeZone("UTC")
        isLenient = false
    }.parse(value)
}.getOrNull()

@Composable
internal fun BookingCalendar(
    profile: String,
    slots: List<JSONObject>,
    viewer: NativeUser?,
    busy: Boolean,
    book: (JSONObject) -> Unit,
    cancel: (JSONObject) -> Unit,
) {
    val locale = Locale.forLanguageTag("ru-RU")
    val dayFormat = remember { SimpleDateFormat("yyyy-MM-dd", Locale.ROOT) }
    val clock = remember { SimpleDateFormat("HH:mm", locale) }
    val dates = remember(slots) {
        slots.mapNotNull { row -> parseTimestamp(row.cleanString("startsAt"))?.let { TimeSlot(it, row) } }.sortedBy { it.start }
    }
    if (dates.isEmpty()) {
        NativeMessage("Сейчас нет доступных слотов.")
        return
    }
    val types = dates.groupBy { it.row.cleanString("title") to it.minutes }
    var typeIndex by rememberSaveable { mutableStateOf(0) }
    val type = types.keys.elementAtOrNull(typeIndex) ?: types.keys.first()
    val days = types.getValue(type).groupBy { dayFormat.format(it.start) }
    val calendarStart = days.keys.first().take(7)
    var monthKey by rememberSaveable(typeIndex, calendarStart) { mutableStateOf(calendarStart) }
    var dayKey by rememberSaveable(typeIndex) { mutableStateOf<String?>(null) }
    var selected by rememberSaveable(typeIndex) { mutableStateOf<String?>(null) }
    val slot = days[dayKey]?.find { it.row.cleanString("id") == selected }
    val month = Calendar.getInstance().apply {
        clear()
        set(monthKey.substring(0, 4).toInt(), monthKey.substring(5, 7).toInt() - 1, 1, 12, 0)
    }
    val minMonth = days.keys.first().take(7)
    val maxMonth = days.keys.last().take(7)
    fun jump(offset: Int) {
        month.add(Calendar.MONTH, offset)
        monthKey = dayFormat.format(month.time).take(7)
        dayKey = null
        selected = null
    }
    if (types.size > 1) {
        NativeTitle("Выберите тип встречи")
        LazyRow(horizontalArrangement = Arrangement.spacedBy(ControlGap)) {
            items(types.keys.toList().withIndex().toList()) { (index, option) ->
                OutlinedButton(onClick = { typeIndex = index }, enabled = !busy) { Text(option.first) }
            }
        }
    }
    Surface(color = MaterialTheme.colorScheme.surfaceContainer, shape = RoundedCornerShape(16.dp)) {
        Column {
            Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    NativeMessage(profile)
                    Text(type.first, style = MaterialTheme.typography.headlineMedium)
                    NativeMessage("${type.second} мин")
                    NativeMessage("Онлайн")
                }
            }
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(ControlGap)) {
                if (slot != null) {
                    Text("Данные участника", style = MaterialTheme.typography.headlineMedium)
                    Text(displayDate(slot.row.cleanString("startsAt")))
                    if (viewer != null) Text(viewer.name)
                    if (slot.row.optBoolean("bookedByMe")) {
                        Text("Вы записаны на сессию")
                        OutlinedButton(onClick = { cancel(slot.row) }, enabled = !busy) { Text("Отменить запись") }
                    } else {
                        Button(onClick = { book(slot.row) }, enabled = !busy, modifier = Modifier.heightIn(min = ControlSize)) {
                            Text(if (viewer == null) "Войти для записи" else "Подтвердить запись")
                        }
                    }
                    TextButton(onClick = { selected = null }, enabled = !busy) { Text("К календарю") }
                } else {
                    Text("Выберите дату и время", style = MaterialTheme.typography.headlineMedium)
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        val name = SimpleDateFormat("LLLL yyyy", locale).format(month.time).replaceFirstChar { it.titlecase(locale) }
                        Text(name, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                        if (monthKey > minMonth) ChromeIconButton(Icons.Default.KeyboardArrowLeft, "Предыдущий месяц", { jump(-1) })
                        if (monthKey < maxMonth) ChromeIconButton(Icons.Default.KeyboardArrowRight, "Следующий месяц", { jump(1) })
                    }
                    Row(Modifier.fillMaxWidth()) {
                        listOf("пн","вт","ср","чт","пт","сб","вс").forEach {
                            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { NativeMessage(it) }
                        }
                    }
                    val fromMonday = (month.get(Calendar.DAY_OF_WEEK) + 5) % 7
                    val dayCount = month.getActualMaximum(Calendar.DAY_OF_MONTH)
                    for (week in 0 until (fromMonday + dayCount + 6) / 7) {
                        Row(Modifier.fillMaxWidth()) {
                            for (weekday in 0..6) {
                                val day = week * 7 + weekday - fromMonday + 1
                                Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                                    if (day in 1..dayCount) {
                                        val key = "$monthKey-${day.toString().padStart(2, '0')}"
                                        TextButton(
                                            enabled = key in days && !busy,
                                            onClick = { dayKey = key },
                                            contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
                                        ) { Text(day.toString(), color = if (key == dayKey) MaterialTheme.colorScheme.primary else androidx.compose.ui.graphics.Color.Unspecified) }
                                    }
                                }
                            }
                        }
                    }
                    Text("Часовой пояс", style = MaterialTheme.typography.titleMedium)
                    NativeMessage(java.util.TimeZone.getDefault().id)
                    days[dayKey].orEmpty().forEach { time ->
                        OutlinedButton(onClick = { selected = time.row.getString("id") }, enabled = !busy, modifier = Modifier.heightIn(min = ControlSize)) {
                            Text(clock.format(time.start))
                        }
                    }
                }
            }
        }
    }
}

private data class TimeSlot(val start: Date, val row: JSONObject) {
    val minutes: Long
        get() = ((parseTimestamp(row.cleanString("endsAt"))?.time ?: start.time) - start.time) / 60_000
}
