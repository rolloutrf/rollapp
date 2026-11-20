package ru.rollapp.android

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject

internal enum class PersonalPage(
    val title: String, val intro: String, val webPath: String, val api: String, val collection: String?,
) {
    Wishes("Мой вишлист", "Ваши желания и списки", "/app/wishes", "/api/dashboard", "wishes"),
    Planning("Задачи", "Основной список дел", "/app/planning", "/api/planning/tasks?space=main", "tasks"),
    Identity("Идентичность", "Ваши принципы", "/app/spheres/identity", "/api/identity/content/principles", null),
    Career("Карьера", "Раздел «О себе»", "/app/spheres/career", "/api/career/content/about", null),
    Education("Образование", "Ваши курсы", "/app/spheres/education", "/api/education/courses", "courses"),
    Health("Здоровье", "Ваши тренировки", "/app/spheres/health", "/api/health/workouts", "workouts"),
    Friends("Друзья", "Ваши подписки", "/app/friends", "/api/people?scope=subscriptions", "people"),
    Orders("Покупки", "Ваши заказы", "/app/store", "/api/rolls/orders", "orders");

    companion object {
        fun forPath(path: String) = entries.find { it.webPath == path.substringBefore('?') }
    }
}

private data class PersonalEntry(val id: String, val title: String, val description: String, val caption: String)

private sealed interface ContentState {
    data object Loading : ContentState
    data class Ready(val entries: List<PersonalEntry>) : ContentState
    data class Error(val message: String) : ContentState
}

private fun parsePersonal(page: PersonalPage, json: JSONObject): List<PersonalEntry> {
    val collection = page.collection
    if (collection == null) {
        val prose = json.opt("content") as? String
        return prose?.takeIf { it.isNotBlank() }?.let {
            listOf(PersonalEntry(page.name, page.intro, it, ""))
        }.orEmpty()
    }
    val entries = json.getJSONArray(collection)
    return (0 until entries.length()).mapNotNull { index ->
        val entry = entries.getJSONObject(index)
        if (entry.optBoolean("archived")) return@mapNotNull null
        val title = when (page) {
            PersonalPage.Friends -> entry.text("name")
            PersonalPage.Orders -> entry.text("itemTitle").ifBlank { entry.text("title") }
            else -> entry.text("title")
        }.ifBlank { return@mapNotNull null }
        val description = when (page) {
            PersonalPage.Friends -> entry.text("bio")
            PersonalPage.Health -> entry.text("notes")
            else -> entry.text("description")
        }
        val caption = when (page) {
            PersonalPage.Planning -> if (entry.optBoolean("completed")) "Выполнено" else entry.text("dueOn")
            PersonalPage.Friends -> entry.text("username").takeIf { it.isNotBlank() }?.let { "@$it" }.orEmpty()
            PersonalPage.Education -> entry.text("provider")
            PersonalPage.Health -> entry.text("workoutOn")
            else -> ""
        }
        PersonalEntry(entry.getString("id"), title, description, caption)
    }.distinctBy { it.id }
}

private fun JSONObject.text(key: String) = opt(key) as? String ?: ""

@Composable
internal fun PersonalScreen(
    page: PersonalPage,
    login: LoginState,
    startLogin: () -> Unit,
    retrySession: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val credential = (login as? LoginState.Open)?.credential
    var revision by remember(page, credential) { mutableStateOf(0) }
    var content by remember(page, credential, revision) { mutableStateOf<ContentState>(ContentState.Loading) }
    var draft by remember(page, credential) { mutableStateOf("") }
    var saving by remember(page, credential) { mutableStateOf(false) }
    var saveError by remember(page, credential) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val canCreate = page == PersonalPage.Planning
    LaunchedEffect(page, credential, revision) {
        if (credential == null) return@LaunchedEffect
        content = try {
            val payload = requestNativeJson(page.api, credential.cookie, credential.user.id).json
            ContentState.Ready(parsePersonal(page, payload))
        } catch (cause: CancellationException) {
            throw cause
        } catch (cause: NativeHttpError) {
            ContentState.Error(when (cause.status) {
                401, 409 -> "Сессия изменилась. Проверьте вход в аккаунт."
                403 -> "Этот раздел недоступен вашему аккаунту."
                else -> "Не удалось загрузить раздел."
            })
        } catch (_: Exception) {
            ContentState.Error("Не удалось загрузить раздел. Проверьте подключение.")
        }
    }
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { SectionIntro("Личное пространство", page.intro) }
        if (credential == null) {
            item { SignInPrompt(login, startLogin, retrySession) }
        } else {
            when (val snapshot = content) {
                ContentState.Loading -> item { CircularProgressIndicator() }
                is ContentState.Error -> item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(snapshot.message)
                        OutlinedButton(onClick = { revision++; retrySession() }, modifier = Modifier.heightIn(min = 48.dp)) {
                            Text("Повторить")
                        }
                    }
                }
                is ContentState.Ready -> {
                    if (canCreate) item {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(draft, { draft = it.take(200); saveError = false },
                                enabled = !saving, label = { Text("Название") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                            Button(
                                enabled = !saving && !saveError && draft.isNotBlank(),
                                onClick = {
                                    if (saving) return@Button
                                    saving = true
                                    saveError = false
                                    scope.launch {
                                        try {
                                            val payload = JSONObject().put("title", draft.trim())
                                            requestNativeJson(page.api, credential.cookie, credential.user.id, payload)
                                            draft = ""
                                            revision++
                                        } catch (cause: CancellationException) {
                                            throw cause
                                        } catch (_: Exception) {
                                            saveError = true
                                        } finally {
                                            saving = false
                                        }
                                    }
                                },
                                modifier = Modifier.heightIn(min = 48.dp),
                            ) { Text(if (saving) "Сохраняем…" else "Добавить задачу") }
                            if (saveError) {
                                Text("Сохранение не подтверждено. Проверьте, появился ли элемент в списке.")
                                OutlinedButton(onClick = { saveError = false; revision++ }, modifier = Modifier.heightIn(min = 48.dp)) {
                                    Text("Обновить список")
                                }
                            }
                        }
                    }
                    if (snapshot.entries.isEmpty()) item { Text("Здесь пока ничего нет.") }
                    items(snapshot.entries, key = { it.id }) { entry ->
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            color = MaterialTheme.colorScheme.surfaceContainer,
                            shape = RoundedCornerShape(24.dp),
                        ) {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(entry.title, style = MaterialTheme.typography.titleLarge)
                                if (entry.caption.isNotBlank()) Text(entry.caption, style = MaterialTheme.typography.bodySmall)
                                if (entry.description.isNotBlank()) Text(entry.description)
                            }
                        }
                    }
                }
            }
        }

    }
}

@Composable
private fun SignInPrompt(state: LoginState, startLogin: () -> Unit, retry: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(28.dp)) {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            when (state) {
                LoginState.Working -> CircularProgressIndicator()
                is LoginState.Error -> {
                    Text(state.message)
                    OutlinedButton(onClick = retry, modifier = Modifier.heightIn(min = 48.dp)) { Text("Проверить сессию") }
                }
                else -> Text("Войдите, чтобы открыть свои данные. Подтверждение входа откроется в браузере.")
            }
            if (state != LoginState.Working) {
                Button(onClick = startLogin, modifier = Modifier.heightIn(min = 48.dp)) { Text("Войти через Яндекс ID") }
            }
        }
    }
}
