package ru.rollapp.android

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException

private sealed interface ReaderState {
    data object Loading : ReaderState
    data object NotFound : ReaderState
    data object Failed : ReaderState
    data class Ready(val wishlist: PublicWishlist) : ReaderState
}

@Composable
internal fun WishlistScreen(
    request: WishlistTarget,
    layout: CollectionLayout,
    detailId: String?,
    selectWish: (String) -> Unit,
    selectList: (String?, WishSpace) -> Unit,
    onBack: () -> Unit,
    onHome: () -> Unit,
    credential: NativeCredential?,
    onLogin: () -> Unit,
    openPublication: (PublicationTarget) -> Unit,
    share: (String) -> Unit,
) {
    var revision by remember(request) { mutableIntStateOf(0) }
    var state by remember(request, revision, credential) { mutableStateOf<ReaderState>(ReaderState.Loading) }
    var listId by rememberSaveable(request) { mutableStateOf(request.listId) }
    val gridState = key(request) { rememberLazyListState() }
    val openedGroup = rememberSaveable(request) { mutableStateOf<String?>(null) }
    LaunchedEffect(request, revision, credential) {
        state = try {
            ReaderState.Ready(fetchWishlist(request, credential))
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: WishlistMissing) {
            ReaderState.NotFound
        } catch (_: Exception) {
            ReaderState.Failed
        }
    }
    when (val snapshot = state) {
        ReaderState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        ReaderState.NotFound -> CollectionMessage(
            layout, "Такой список не нашёлся",
            if (request.token != null) "Список не найден" else "Профиль не найден",
            "В приложение", onHome,
        )
        ReaderState.Failed -> CollectionMessage(
            layout, "Не удалось загрузить список", "Проверьте подключение к интернету.",
            "Повторить", { revision++ },
        )
        is ReaderState.Ready -> {
            val wishlist = snapshot.wishlist
            val detail = wishlist.wishes.find { it.id == (detailId ?: request.wishId) }
            if (detail != null) {
                PublicWishDetail(
                    detail, layout, credential, request, wishlist.isOwner, onBack, onLogin, share,
                    onChanged = { revision++ },
                )
                return
            }
            val space = wishlist.lists.find { it.id == request.listId }?.space ?: request.space ?: WishSpace.Products
            val collection = remember(snapshot, space, listId) {
                selectCollection(
                    wishlist.lists, wishlist.wishes, space, listId,
                    sharedList = if (request.token != null) wishlist.lists.single() else null,
                    groups = wishlist.groups,
                )
            }
            LaunchedEffect(collection.selected, space) { selectList(collection.selected, space) }
            WishCollectionGrid(
                layout, gridState, collection, { listId = it }, { selectWish(it.id) },
                emptyCopy = "Загляните чуть позже — новая мечта наверняка появится.",
                openedGroup = openedGroup,
                mood = wishlist.mood,
                onWishShare = { share(request.webUrl(it.id)) },
            ) {
                PublicProfile(wishlist, request, layout, credential, onLogin, openPublication, share, onChanged = { revision++ })
            }
        }
    }
}

@Composable
internal fun PublicProfile(
    wishlist: PublicWishlist,
    request: WishlistTarget,
    layout: CollectionLayout,
    credential: NativeCredential?,
    onLogin: () -> Unit,
    openPublication: (PublicationTarget) -> Unit,
    share: (String) -> Unit,
    onChanged: () -> Unit,
    active: Publication? = null,
) {
    var contact by rememberSaveable { mutableStateOf(false) }
    val operation = rememberNativeMutation()
    val profileUrl = WishlistTarget(profile = wishlist.username).webUrl()
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(PageGap)) {
        ProfileIdentity(wishlist.name, wishlist.avatarUrl, layout.avatarSize)
        if (wishlist.bio != null) {
            Text(wishlist.bio, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        }
        if (request.token == null && wishlist.followingCount != null && wishlist.followersCount != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                ProfileCount("Подписки", wishlist.followingCount)
                ProfileCount("Подписчики", wishlist.followersCount)
            }
        }
        Row(
            Modifier.horizontalScroll(rememberScrollState()),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(ControlGap),
        ) {
            if (!wishlist.isOwner) {
                Button(
                    onClick = {
                        if (credential == null) onLogin() else operation.run {
                            credential.request(
                                "/api/profile/${segment(wishlist.username)}/follow",
                                org.json.JSONObject().put("following", !wishlist.isFollowing),
                            )
                            onChanged()
                        }
                    },
                    enabled = !operation.busy && operation.error == null,
                    modifier = Modifier.heightIn(min = ControlSize),
                ) { Text(if (wishlist.isFollowing) "Отписаться" else "Подписаться") }
            }
            OutlinedButton(
                onClick = { contact = true },
                colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainer,
                    contentColor = MaterialTheme.colorScheme.onSurface,
                ),
                modifier = Modifier.heightIn(min = ControlSize),
            ) {
                Text("Визитка")
            }
            if (request.token == null) {
                ChromeIconButton(Icons.Default.DateRange, "Календарь", { openPublication(PublicationTarget(wishlist.username, Publication.Calendar)) }, active == Publication.Calendar)
                ChromeIconButton(Icons.Default.Notifications, "Доска объявлений", { openPublication(PublicationTarget(wishlist.username, Publication.Announcements)) }, active == Publication.Announcements)
            }
        }
    }
    operation.error?.let {
        NativeMessage(it, error = true)
        TextButton(onClick = onChanged) { Text("Обновить") }
    }
    if (contact) {
        AlertDialog(
            onDismissRequest = { contact = false },
            title = { Text("Цифровая визитка") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(ControlGap)) {
                    Text(wishlist.name, style = MaterialTheme.typography.titleMedium)
                    Text("@${wishlist.username}")
                }
            },
            confirmButton = { TextButton(onClick = { share(profileUrl) }) { Text("Поделиться") } },
            dismissButton = { TextButton(onClick = { contact = false }) { Text("Закрыть") } },
        )
    }
}

@Composable
private fun ProfileCount(label: String, count: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(count.toString(), style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
internal fun WishlistLookupScreen(layout: CollectionLayout, onBack: () -> Unit, submit: (WishlistTarget) -> Unit) {
    var input by rememberSaveable { mutableStateOf("") }
    var invalid by rememberSaveable { mutableStateOf(false) }
    val focus = LocalFocusManager.current
    fun show() {
        val target = parseWishlistTarget(input)
        invalid = target == null
        if (target != null) {
            focus.clearFocus()
            submit(target)
        }
    }
    Column(
        Modifier.widthIn(max = 448.dp).fillMaxWidth().verticalScroll(rememberScrollState())
            .padding(horizontal = layout.inset, vertical = PageGap),
        verticalArrangement = Arrangement.spacedBy(PageGap),
    ) {
        ChromeIconButton(Icons.AutoMirrored.Filled.ArrowBack, "Назад", onBack)
        Text("Открыть вишлист", style = MaterialTheme.typography.headlineLarge, modifier = Modifier.semantics { heading() })
        OutlinedTextField(
            value = input,
            onValueChange = { input = it.take(2048); invalid = false },
            label = { Text("Ссылка или имя профиля") },
            singleLine = true,
            isError = invalid,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
            keyboardActions = KeyboardActions(onGo = { if (input.isNotBlank()) show() }),
            modifier = Modifier.fillMaxWidth(),
        )
        if (invalid) {
            Text(
                "Укажите ссылку на вишлист Rollapp или имя профиля.",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
        Button(onClick = ::show, enabled = input.isNotBlank(), modifier = Modifier.heightIn(min = ControlSize)) { Text("Открыть") }
    }
}

@Composable
private fun CollectionMessage(layout: CollectionLayout, title: String, message: String, label: String, onAction: () -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        val viewport = maxHeight
        Column(
            Modifier.padding(horizontal = layout.inset).widthIn(max = 448.dp).fillMaxWidth()
                .verticalScroll(rememberScrollState()).heightIn(min = viewport)
                .padding(top = if (viewport >= 500.dp) 160.dp else PageGap, bottom = PageGap),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(ControlGap, Alignment.CenterVertically),
        ) {
            Icon(painterResource(R.drawable.wishlist_gift), null, Modifier.padding(bottom = 12.dp).size(90.dp))
            Text(
                title, style = MaterialTheme.typography.displaySmall,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading(); liveRegion = LiveRegionMode.Polite },
            )
            Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            Button(onClick = onAction, modifier = Modifier.heightIn(min = ControlSize)) { Text(label) }
        }
    }
}

internal data class WishAction(val label: String, val enabled: Boolean = true, val invoke: () -> Unit)

@Composable
private fun PublicWishDetail(
    wish: PublicWish, layout: CollectionLayout, credential: NativeCredential?, target: WishlistTarget,
    owner: Boolean, onBack: () -> Unit, onLogin: () -> Unit, share: (String) -> Unit, onChanged: () -> Unit,
) {
    val operation = rememberNativeMutation()
    val available = wish.reservationCount == 0 || wish.allowMultiple || wish.reservedByMe
    val label = when {
        owner -> "Исполнить"
        wish.reservedByMe -> "Снять бронь"
        !available -> "Занято"
        else -> "Забронировать"
    }
    val payload = org.json.JSONObject().put("shareToken", target.token.orEmpty())
    val path = "/api/wishes/${segment(wish.id)}"
    fun mutate(action: String, payload: org.json.JSONObject) {
        if (credential == null) {
            onLogin()
        } else operation.run {
            credential.request("$path/$action", payload)
            onChanged()
        }
    }
    WishDetails(
        wish, layout, onBack,
        action = WishAction(label, available && !operation.busy && operation.error == null) {
            if (owner) {
                if (credential != null) operation.run {
                    credential.request("$path/fulfilled", org.json.JSONObject().put("fulfilled", true))
                    onBack()
                    onChanged()
                }
            } else mutate("reserve", payload)
        },
        actions = buildList {
            if (!owner) add(WishAction("Добавить в мой вишлист", !wish.likedByMe && !operation.busy && operation.error == null) { mutate("copy", payload) })
            add(WishAction("Поделиться") { share(target.webUrl(wish.id)) })
        },
        error = operation.error,
        refresh = onChanged,
    )
}

@Composable
internal fun WishDetails(
    wish: PublicWish,
    layout: CollectionLayout,
    onBack: () -> Unit,
    action: WishAction,
    actions: List<WishAction> = emptyList(),
    error: String? = null,
    refresh: (() -> Unit)? = null,
) {
    NativePage(layout, maxWidth = 576.dp, footer = {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(ControlGap),
        ) {
            ChromeIconButton(Icons.AutoMirrored.Filled.ArrowBack, "Назад", onBack)
            Button(onClick = action.invoke, enabled = action.enabled, modifier = Modifier.weight(1f).heightIn(min = ControlSize)) {
                Text(action.label, maxLines = 1)
            }
            if (actions.isNotEmpty()) {
                var expanded by remember { mutableStateOf(false) }
                Box {
                    ChromeIconButton(Icons.Default.MoreVert, "Другие действия", { expanded = true })
                    DropdownMenu(expanded, onDismissRequest = { expanded = false }) {
                        actions.forEach { item ->
                            DropdownMenuItem(text = { Text(item.label) }, enabled = item.enabled, onClick = { expanded = false; item.invoke() })
                        }
                    }
                }
            }
        }
    }) {
        Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
            WishImage(wish, Modifier.fillMaxWidth().aspectRatio(1f))
        }
        Column(verticalArrangement = Arrangement.spacedBy(ControlGap)) {
            Text(wish.title, style = MaterialTheme.typography.displaySmall, modifier = Modifier.semantics { heading() })
            formattedPrice(wish)?.let { Text(it, style = MaterialTheme.typography.titleLarge) }
            if (wish.description.isNotBlank()) Text(wish.description)
            val url = wish.url?.let(::resolveImage)?.takeUnless(::isRollappUrl)
            if (url != null) {
                val uri = androidx.compose.ui.platform.LocalUriHandler.current
                OutlinedButton(onClick = { uri.openUri(url) }, modifier = Modifier.heightIn(min = ControlSize)) { Text("К продавцу") }
            }
        }
        if (error != null) {
            NativeMessage(error, error = true)
            if (refresh != null) OutlinedButton(onClick = refresh) { Text("Обновить") }
        }
    }
}
