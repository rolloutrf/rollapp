package ru.rollapp.android

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

internal enum class WishEditor(val title: String, val submitLabel: String, val endpoint: String, val limit: Int) {
    Wish("Добавить желание", "Загадать желание", "/api/wishes", 160),
    EditWish("Редактировать желание", "Обновить", "/api/wishes", 160),
    List("Новый список", "Создать список", "/api/lists", 80),
}

private sealed interface DashboardState {
    data object Loading : DashboardState
    data object Failed : DashboardState
    data class Ready(val lists: List<PublicList>, val wishes: List<PublicWish>, val groups: List<WishGroup>) : DashboardState
}

@Composable
internal fun PersonalWishlistScreen(
    credential: NativeCredential,
    space: WishSpace,
    layout: CollectionLayout,
    profileHeader: @Composable () -> Unit,
    share: (String) -> Unit,
    editor: WishEditor?,
    showEditor: (WishEditor?) -> Unit,
    wishId: String?,
    showWish: (String?) -> Unit,
) {
    var revision by remember { mutableIntStateOf(0) }
    var dashboard by remember(credential, revision) { mutableStateOf<DashboardState>(DashboardState.Loading) }
    var listId by rememberSaveable { mutableStateOf<String?>(null) }
    val state = rememberLazyListState()
    val openedGroup = rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(credential, revision) {
        dashboard = try {
            val data = requestNativeJson("/api/dashboard", credential.cookie, credential.user.id).json
            val lists = data.getJSONArray("lists")
            val wishes = data.getJSONArray("wishes")
            DashboardState.Ready(
                (0 until lists.length()).map { lists.getJSONObject(it).toPublicList() },
                (0 until wishes.length()).mapNotNull { index ->
                    val item = wishes.getJSONObject(index)
                    item.takeIf { it.optString("status") == "active" }?.toWish()
                }.distinctBy { it.id },
                data.wishGroups(),
            )
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            DashboardState.Failed
        }
    }

    when (val result = dashboard) {
        DashboardState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        DashboardState.Failed -> Column(Modifier.padding(PageGap), verticalArrangement = Arrangement.spacedBy(ControlGap)) {
            Text("Не удалось загрузить вишлист", Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            OutlinedButton(onClick = { revision++ }, modifier = Modifier.heightIn(min = ControlSize)) { Text("Повторить") }
        }
        is DashboardState.Ready -> {
            val collection = remember(result, space, listId) {
                selectCollection(result.lists, result.wishes, space, listId, groups = result.groups)
            }
            val wish = result.wishes.find { it.id == wishId }
            if (editor != null) {
                val edit = wish.takeIf { editor == WishEditor.EditWish }
                WishEditorScreen(credential, space, collection.selected, editor, edit, result.lists, layout, onBack = { showEditor(null) }) { newList ->
                    if (newList != null) listId = newList
                    showEditor(null)
                    revision++
                }
                return
            }
            if (wish != null) {
                OwnWishDetail(
                    wish, credential, result.lists, layout, { showWish(null) }, { showEditor(WishEditor.EditWish) },
                    share, onChanged = { showWish(null); revision++ },
                )
                return
            }
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                WishCollectionGrid(layout, state, collection, { listId = it }, { showWish(it.id) },
                    emptyCopy = "Добавьте то, что действительно порадует.",
                    openedGroup = openedGroup,
                    mood = credential.user.mood,
                    bottomPadding = ControlSize + PageGap,
                ) {
                    profileHeader()
                }
                Box(
                    Modifier.align(Alignment.BottomEnd)
                        .padding(end = layout.inset, bottom = if (layout.mobile) 0.dp else 16.dp),
                ) {
                    WishlistAddMenu(showEditor)
                }
            }
        }
    }
}

@Composable
internal fun PersonalProfile(
    user: NativeUser,
    layout: CollectionLayout,
    onProfile: () -> Unit,
    onFriends: () -> Unit,
    onSection: (WishlistSection?) -> Unit,
    onPublication: (Publication) -> Unit,
    onPublic: () -> Unit,
    active: WishlistSection? = null,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(ControlGap)) {
        ProfileIdentity(user.name, user.avatarUrl, layout.avatarSize, onProfile)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ControlGap)) {
            if (user.memberNumber != null) Text("ID #${user.memberNumber}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            TextButton(onClick = onFriends, modifier = Modifier.heightIn(min = ControlSize)) { Text("Друзья") }
        }
        Row(
            Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(ControlGap),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedButton(
                onClick = { onSection(null) },
                enabled = active != null,
                modifier = Modifier.heightIn(min = ControlSize),
                contentPadding = ButtonDefaults.TextButtonContentPadding,
            ) {
                Icon(painterResource(R.drawable.wishlist_gift), "Вишлист", Modifier.size(ControlIconSize))
            }
            ChromeIconButton(Icons.AutoMirrored.Filled.List, "Лента", { onSection(WishlistSection.Feed) }, active == WishlistSection.Feed)
            ChromeIconButton(Icons.Default.ShoppingCart, "Каталог брендов", { onSection(WishlistSection.Brands) }, active == WishlistSection.Brands)
            ChromeIconButton(Icons.Default.ShoppingCart, "Магазин", { onSection(WishlistSection.Store) }, active == WishlistSection.Store)
            ChromeIconButton(Icons.AutoMirrored.Filled.Send, "Предложения", { onSection(WishlistSection.Offers) }, active == WishlistSection.Offers)
            ChromeIconButton(Icons.Default.DateRange, "Календарь", { onPublication(Publication.Calendar) })
            ChromeIconButton(Icons.Default.Notifications, "Доска объявлений", { onPublication(Publication.Announcements) })
        }
        OutlinedButton(
            onClick = onPublic,
            modifier = Modifier.padding(top = 16.dp).heightIn(min = ControlSize),
        ) { Text("Моя страница") }
    }
}

@Composable
private fun WishlistAddMenu(showEditor: (WishEditor) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        FloatingActionButton(
            onClick = { expanded = true },
            modifier = Modifier.size(ControlSize),
            shape = CircleShape,
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
        ) { Icon(Icons.Default.Add, "Добавить", Modifier.size(ControlIconSize)) }
        DropdownMenu(expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text(WishEditor.Wish.title) },
                onClick = { expanded = false; showEditor(WishEditor.Wish) },
            )
            DropdownMenuItem(
                text = { Text(WishEditor.List.title) },
                onClick = { expanded = false; showEditor(WishEditor.List) },
            )
        }
    }
}

@Composable
private fun OwnWishDetail(
    wish: PublicWish,
    credential: NativeCredential,
    lists: List<PublicList>,
    layout: CollectionLayout,
    onBack: () -> Unit,
    edit: () -> Unit,
    share: (String) -> Unit,
    onChanged: () -> Unit,
) {
    val operation = rememberNativeMutation()
    var delete by rememberSaveable { mutableStateOf(false) }
    val path = "/api/wishes/${segment(wish.id)}"
    val canShare = wish.privacy != "private" && lists.none { it.privacy == "private" && it.id in wish.listIds }
    WishDetails(
        wish, layout, { if (!operation.busy) onBack() },
        action = WishAction("Исполнить", !operation.busy && operation.error == null) {
            operation.run {
                credential.request("$path/fulfilled", JSONObject().put("fulfilled", true))
                onChanged()
            }
        },
        actions = buildList {
            add(WishAction("Редактировать", !operation.busy, edit))
            if (canShare) add(WishAction("Поделиться") {
                share(WishlistTarget(profile = credential.user.username).webUrl(wish.id))
            })
            add(WishAction("Удалить", !operation.busy && operation.error == null) { delete = true })
        },
        error = operation.error,
        refresh = onChanged,
    )
    if (delete) androidx.compose.material3.AlertDialog(
        onDismissRequest = { delete = false },
        title = { Text("Удалить желание?") },
        text = { Text(wish.title) },
        confirmButton = {
            Button(
                onClick = {
                    delete = false
                    operation.run { credential.request(path, method = "DELETE"); onChanged() }
                },
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error, contentColor = MaterialTheme.colorScheme.onError),
            ) { Text("Удалить") }
        },
        dismissButton = { TextButton(onClick = { delete = false }) { Text("Отмена") } },
    )
}

@Composable
private fun WishEditorScreen(
    credential: NativeCredential,
    space: WishSpace,
    listId: String?,
    editor: WishEditor,
    edit: PublicWish?,
    lists: List<PublicList>,
    layout: CollectionLayout,
    onBack: () -> Unit,
    onSaved: (String?) -> Unit,
) {
    val forWish = editor != WishEditor.List
    var title by rememberSaveable(editor, edit?.id) { mutableStateOf(edit?.title.orEmpty()) }
    var description by rememberSaveable(editor, edit?.id) { mutableStateOf(edit?.description.orEmpty()) }
    var url by rememberSaveable(editor, edit?.id) { mutableStateOf(edit?.url.orEmpty()) }
    var price by rememberSaveable(editor, edit?.id) { mutableStateOf(edit?.price?.toString().orEmpty()) }
    var currency by rememberSaveable(editor, edit?.id) { mutableStateOf(edit?.currency?.takeIf(String::isNotBlank) ?: "RUB") }
    var privateItem by rememberSaveable(editor, edit?.id) { mutableStateOf(edit?.privacy == "private" || edit == null) }
    var selected by rememberSaveable(editor, edit?.id) {
        mutableStateOf(ArrayList(edit?.listIds ?: listOfNotNull(listId)))
    }
    val operation = rememberNativeMutation()
    val amount = price.replace(',', '.').toDoubleOrNull()?.takeIf { it.isFinite() && it in 0.0..999999999.0 }
    val safeUrl = url.isBlank() || runCatching {
        val uri = java.net.URI(url.trim())
        uri.scheme in setOf("http", "https") && uri.host != null && uri.userInfo == null
    }.getOrDefault(false)
    val ready = !operation.busy && title.isNotBlank() && (!forWish || (safeUrl && (price.isBlank() || amount != null)))
    val cancel = { if (!operation.busy) onBack() }
    androidx.activity.compose.BackHandler(onBack = cancel)
    NativePage(layout, maxWidth = 576.dp, footer = {
        NativeFooter(cancel, editor.submitLabel, ready, {
            val payload = JSONObject().put("title", title.trim()).put("description", description.trim())
            if (edit == null) payload.put("space", space.id)
            payload.put("privacy", if (privateItem) "private" else if (forWish) "inherit" else "public")
            if (forWish) {
                payload.put("url", url.trim()).put("price", amount ?: JSONObject.NULL)
                    .put("currency", currency).put("listIds", JSONArray(selected))
            }
            operation.run {
                val result = credential.request(
                    editor.endpoint + (edit?.id?.let { "/${segment(it)}" } ?: ""),
                    payload, if (edit == null) "POST" else "PATCH",
                )
                onSaved(result.optJSONObject("list")?.cleanString("id")?.takeIf(String::isNotBlank))
            }
        })
    }) {
        NativeTitle(editor.title)
        if (forWish) FormField(url, { url = it }, "Ссылка", 2000, enabled = !operation.busy)
        FormField(title, { title = it }, "Название", editor.limit, enabled = !operation.busy)
        FormField(description, { description = it }, "Описание", if (forWish) 1000 else 300, lines = 3, enabled = !operation.busy)
        if (forWish) {
            FormField(price, { price = it }, "Цена", 16, enabled = !operation.busy)
            var currencies by remember { mutableStateOf(false) }
            Box {
                OutlinedButton(onClick = { currencies = true }, enabled = !operation.busy) { Text(currency) }
                DropdownMenu(currencies, onDismissRequest = { currencies = false }) {
                    listOf("RUB", "USD", "EUR", "KZT", "BYN").forEach { code ->
                        DropdownMenuItem(text = { Text(code) }, onClick = { currency = code; currencies = false })
                    }
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ControlGap)) {
            androidx.compose.material3.Switch(checked = privateItem, onCheckedChange = { privateItem = it }, enabled = !operation.busy)
            Text(if (forWish) "Секретное желание" else "Приватный список")
        }
        if (forWish) {
            val available = lists.filter { !it.general && (it.space ?: WishSpace.Products) == (edit?.space ?: space) }
            if (available.isNotEmpty()) Text("Списки", style = MaterialTheme.typography.titleLarge)
            available.forEach { list ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ControlGap)) {
                    androidx.compose.material3.Checkbox(
                        checked = list.id in selected,
                        onCheckedChange = { add ->
                            selected = ArrayList(if (add) selected + list.id else selected - list.id)
                        },
                        enabled = !operation.busy,
                    )
                    Text(list.title)
                }
            }
        }
        operation.error?.let { NativeMessage(it, error = true) }
    }
}
