package ru.rollapp.android

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.style.TextAlign
import org.json.JSONObject
import java.text.DateFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

internal enum class Publication(val segment: String, val title: String, val collection: String) {
    Calendar("calendar", "Календарь", "slots"),
    Announcements("announcements", "Доска объявлений", "announcements"),
}

internal data class PublicationTarget(val profile: String, val section: Publication) {
    val endpoint get() = "/api/profile/${segment(profile)}/${section.segment}"
}

internal fun parsePublication(input: String): PublicationTarget? {
    val url = Regex("https://[^\\s<>]+", RegexOption.IGNORE_CASE).find(input)?.value
        ?.trimEnd('.', ',', ')', ']', '!', ';') ?: return null
    if (!isRollappUrl(url)) return null
    val uri = runCatching { java.net.URI(url) }.getOrNull() ?: return null
    if (Regex("%(?:2f|5c)", RegexOption.IGNORE_CASE).containsMatchIn(uri.rawPath)) return null
    val parts = uri.path.removePrefix("/").removeSuffix("/").split("/")
    val calendar = parts.getOrNull(1) in setOf("calendar", "календарь")
    val section = when {
        calendar && (parts.size == 2 || parts.size == 3 && parts[2] in setOf("book", "запись")) -> Publication.Calendar
        parts.size == 2 && parts[1] in setOf("announcements", "публикации") -> Publication.Announcements
        else -> return null
    }
    val profile = parseWishlistTarget("$ROLLAPP_ORIGIN/${segment(parts[0])}")?.profile ?: return null
    return PublicationTarget(profile, section)
}

private fun utcFormat() = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT).apply {
    timeZone = TimeZone.getTimeZone("UTC")
    isLenient = false
}

internal fun displayDate(iso: String): String {
    val value = runCatching { utcFormat().parse(iso) }.getOrNull() ?: return iso
    return DateFormat.getDateTimeInstance(DateFormat.LONG, DateFormat.SHORT, Locale.forLanguageTag("ru-RU")).format(value)
}

@Composable
internal fun PublicationsScreen(
    target: PublicationTarget,
    credential: NativeCredential?,
    layout: CollectionLayout,
    onBack: () -> Unit,
    onLogin: () -> Unit,
    profileHeader: @Composable () -> Unit,
) {
    var revision by remember { mutableIntStateOf(0) }
    val snapshot by nativeData(target.endpoint, credential, revision)
    val operation = rememberNativeMutation()
    var form by remember { mutableStateOf<JSONObject?>(null) }
    var remove by remember { mutableStateOf<String?>(null) }
    val calendar = target.section == Publication.Calendar
    val data = (snapshot as? NativeData.Ready)?.value
    val owner = credential != null && data?.optBoolean("isOwner") == true

    if (form != null && credential != null && owner) {
        PublicationEditor(calendar, requireNotNull(form), layout, operation, onBack = { if (!operation.busy) form = null }) { payload, id ->
            operation.run {
                val edit = id.isNotBlank()
                credential.request(target.endpoint + if (edit) "/${segment(id)}" else "", payload, if (edit) "PATCH" else "POST")
                form = null
                revision++
            }
        }
        return
    }

    NativePage(layout, maxWidth = if (calendar) 1024.dp else 768.dp, topPadding = 12.dp) {
        profileHeader()
        if (calendar) {
            OutlinedButton(onClick = onBack, modifier = Modifier.heightIn(min = ControlSize)) {
                androidx.compose.material3.Icon(Icons.AutoMirrored.Filled.ArrowBack, null, Modifier.size(ControlIconSize))
                Text("К Вишлисту", Modifier.padding(start = ControlGap))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                androidx.compose.material3.Icon(Icons.Default.DateRange, null)
                NativeTitle(target.section.title)
            }
        }
        operation.error?.let { NativeMessage(it, error = true) }
        DataContent(snapshot, { revision++ }) { response ->
            if (owner) {
                Button(onClick = { form = JSONObject() }, enabled = !operation.busy, modifier = Modifier.heightIn(min = ControlSize)) {
                    Text(if (calendar) "Добавить слот" else "Добавить объявление")
                }
            }
            val entries = response.rows(target.section.collection)
            if (entries.isEmpty()) {
                Surface(
                    Modifier.fillMaxWidth().heightIn(min = 320.dp),
                    shape = RoundedCornerShape(16.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    Column(
                        Modifier.fillMaxWidth().padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surfaceContainerHigh) {
                            androidx.compose.material3.Icon(
                                if (calendar) Icons.Default.DateRange else Icons.Default.Notifications,
                                null, Modifier.padding(8.dp).size(16.dp),
                            )
                        }
                        Text(
                            if (calendar) {
                                if (owner) "Нет опубликованных слотов" else "Сейчас нет доступных слотов."
                            } else "Объявлений пока нет",
                            style = MaterialTheme.typography.titleMedium,
                            textAlign = TextAlign.Center,
                        )
                        Text(
                            if (calendar) "Когда появится время для встречи, его можно будет выбрать здесь."
                            else if (owner) "Здесь появятся ваши опубликованные объявления."
                            else "Здесь появятся публикации владельца профиля.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }
            if (calendar && !owner && entries.isNotEmpty()) {
                BookingCalendar(
                    response.getJSONObject("profile").getString("name"), entries, credential?.user, operation.busy,
                    book = { entry ->
                        if (credential == null) onLogin() else operation.run {
                            val id = segment(entry.getString("id"))
                            credential.request("${target.endpoint}/$id/book", JSONObject())
                            revision++
                        }
                    },
                    cancel = { entry ->
                        remove = "${target.endpoint}/${segment(entry.getString("id"))}/bookings/${segment(entry.getString("bookingId"))}"
                    },
                )
            }
            entries.filter { !calendar || owner }.forEach { entry ->
                val id = segment(entry.getString("id"))
                val booking = entry.cleanString("bookingId")
                Surface(color = MaterialTheme.colorScheme.surfaceContainer, shape = RoundedCornerShape(18.dp)) {
                    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(ControlGap)) {
                        Text(entry.getString("title"), style = MaterialTheme.typography.titleLarge)
                        if (calendar) {
                            Text(displayDate(entry.cleanString("startsAt")))
                            entry.cleanString("guestName").takeIf(String::isNotBlank)?.let { NativeMessage(it) }
                            when {
                                booking.isNotBlank() ->
                                    OutlinedButton(onClick = { remove = "${target.endpoint}/$id/bookings/${segment(booking)}" }, enabled = !operation.busy) {
                                        Text("Отменить запись")
                                    }
                                else -> OutlinedButton(onClick = { remove = "${target.endpoint}/$id" }, enabled = !operation.busy) {
                                    Text("Убрать слот")
                                }
                            }
                        } else {
                            val stamp = entry.cleanString("createdAt")
                            if (stamp.isNotBlank()) NativeMessage(displayDate(stamp))
                            Text(entry.cleanString("body"))
                            if (owner) Row(horizontalArrangement = Arrangement.spacedBy(ControlGap)) {
                                TextButton(onClick = { form = entry }, enabled = !operation.busy) { Text("Редактировать") }
                                TextButton(onClick = { remove = "${target.endpoint}/$id" }, enabled = !operation.busy) {
                                    Text("Удалить", color = MaterialTheme.colorScheme.error)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    val deletePath = remove
    if (deletePath != null && credential != null) {
        AlertDialog(
            onDismissRequest = { remove = null },
            title = { Text(if (deletePath.contains("/bookings/")) "Отменить запись?" else if (calendar) "Убрать слот?" else "Удалить объявление?") },
            text = { Text("Изменение отобразится в профиле.") },
            confirmButton = {
                TextButton(onClick = {
                    remove = null
                    operation.run {
                        credential.request(deletePath, method = "DELETE")
                        revision++
                    }
                }) { Text("Подтвердить", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { remove = null }) { Text("Назад") } },
        )
    }
}

@Composable
private fun PublicationEditor(
    calendar: Boolean,
    item: JSONObject,
    layout: CollectionLayout,
    operation: NativeMutation,
    onBack: () -> Unit,
    onSave: (JSONObject, String) -> Unit,
) {
    val id = item.cleanString("id")
    var title by rememberSaveable(id) { mutableStateOf(item.cleanString("title")) }
    var text by rememberSaveable(id) { mutableStateOf(item.cleanString("body")) }
    var duration by rememberSaveable { mutableStateOf("30") }
    var day by rememberSaveable { mutableStateOf("") }
    var time by rememberSaveable { mutableStateOf("") }
    val slotId = rememberSaveable { UUID.randomUUID().toString() }
    val start = remember(day, time) {
        if (day.length != 10 || time.length != 5) null else runCatching {
            SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.ROOT).apply { isLenient = false }.parse("$day $time")
        }.getOrNull()
    }
    val minutes = duration.toIntOrNull()
    val ready = title.isNotBlank() && if (calendar) {
        start != null && start.after(Date()) && minutes != null && minutes in 15..480
    } else text.isNotBlank()
    androidx.activity.compose.BackHandler(onBack = onBack)
    NativePage(layout, maxWidth = 576.dp, footer = {
        NativeFooter(onBack, if (calendar) "Опубликовать" else "Сохранить", ready && !operation.busy, {
            val payload = JSONObject().put("title", title.trim())
            if (calendar && start != null) {
                payload.put("id", slotId).put("startsAt", utcFormat().format(start)).put("duration", minutes)
            } else payload.put("body", text.trim())
            onSave(payload, id)
        })
    }) {
        NativeTitle(if (calendar) "Новый слот" else if (id.isBlank()) "Добавить объявление" else "Редактировать объявление")
        FormField(title, { title = it }, if (calendar) "Название встречи" else "Заголовок объявления", 160, enabled = !operation.busy)
        if (calendar) {
            FormField(day, { day = it }, "Дата (ДД.ММ.ГГГГ)", 10, enabled = !operation.busy)
            FormField(time, { time = it }, "Время (ЧЧ:ММ)", 5, enabled = !operation.busy)
            FormField(duration, { duration = it }, "Длительность в минутах", 3, enabled = !operation.busy)
        } else FormField(text, { text = it }, "Текст объявления", 4000, lines = 4, enabled = !operation.busy)
        operation.error?.let { NativeMessage(it, error = true) }
    }
}

@Composable
internal fun FormField(value: String, change: (String) -> Unit, label: String, limit: Int, lines: Int = 1, enabled: Boolean = true) {
    OutlinedTextField(
        value, { change(it.take(limit)) },
        enabled = enabled,
        label = { Text(label) },
        minLines = lines,
        singleLine = lines == 1,
        modifier = Modifier.fillMaxWidth(),
    )
}
