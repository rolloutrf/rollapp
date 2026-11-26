package ru.rollapp.android

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.Icon
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

internal data class ListTile(val id: String?, val title: String, val count: Int)
internal data class CollectionSelection(
    val tiles: List<ListTile>,
    val selected: String?,
    val wishes: List<PublicWish>,
    val tilesInGrid: List<WishGridItem>,
)

internal fun selectCollection(
    lists: List<PublicList>,
    wishes: List<PublicWish>,
    space: WishSpace,
    selection: String?,
    sharedList: PublicList? = null,
    groups: List<WishGroup> = emptyList(),
): CollectionSelection {
    if (sharedList != null) {
        val title = if (sharedList.general) "Не отсортированные" else sharedList.title
        return CollectionSelection(
            listOf(ListTile(sharedList.id, title, wishes.size)), sharedList.id, wishes,
            groupGrid(wishes, groups.filter { it.listId == sharedList.id }),
        )
    }
    val namedLists = lists.filterNot { it.general }.associateBy { it.id }
    val listsInSpace = namedLists.values.filter { (it.space ?: WishSpace.Products) == space }
        .sortedBy { !it.title.trim().equals("Лайфстайл", ignoreCase = true) }
    val wishesInSpace = wishes.filter { wish ->
        val categories = wish.listIds.mapNotNull(namedLists::get)
        wish.space == space || categories.any { (it.space ?: WishSpace.Products) == space } ||
            (wish.space == null && categories.isEmpty() && space == WishSpace.Products)
    }
    val unsorted = wishesInSpace.filter { wish -> wish.listIds.none(namedLists::containsKey) }
    val tiles = buildList {
        if (unsorted.isNotEmpty()) add(ListTile(null, "Не отсортированные", unsorted.size))
        listsInSpace.forEach { list ->
            add(ListTile(list.id, list.title, wishesInSpace.count { list.id in it.listIds }))
        }
    }
    val selected = tiles.find { it.id == selection }?.id ?: if (tiles.any { it.id == null }) null else tiles.firstOrNull()?.id
    val visible = if (selected == null) unsorted else wishesInSpace.filter { selected in it.listIds }
    val listForGroups = selected ?: lists.find { it.general }?.id
    val visibleGroups = groups.filter { group ->
        group.listId == listForGroups && (selected != null || group.space == null || group.space == space)
    }
    return CollectionSelection(tiles, selected, visible, groupGrid(visible, visibleGroups))
}

internal sealed interface WishGridItem {
    val key: String

    data class Wish(val wish: PublicWish) : WishGridItem {
        override val key = "wish:${wish.id}"
    }

    data class Group(val group: WishGroup, val members: List<PublicWish>) : WishGridItem {
        override val key = "group:${group.id}"
    }
}

private fun groupGrid(wishes: List<PublicWish>, groups: List<WishGroup>): List<WishGridItem> {
    val groupForWish = buildMap { groups.forEach { group -> group.wishIds.forEach { put(it, group) } } }
    val groupMembers = wishes.groupBy { groupForWish[it.id]?.id }
    val emitted = mutableSetOf<String>()
    return wishes.mapNotNull { wish ->
        val group = groupForWish[wish.id]
        when {
            group == null -> WishGridItem.Wish(wish)
            emitted.add(group.id) -> WishGridItem.Group(group, groupMembers.getValue(group.id))
            else -> null
        }
    }
}

@Composable
internal fun WishCollectionGrid(
    layout: CollectionLayout,
    state: LazyListState,
    collection: CollectionSelection,
    selectList: (String?) -> Unit,
    selectWish: (PublicWish) -> Unit,
    emptyCopy: String,
    openedGroup: MutableState<String?>,
    mood: Int?,
    bottomPadding: Dp = PageGap,
    onWishShare: ((PublicWish) -> Unit)? = null,
    identity: @Composable () -> Unit,
) {
    val openGroup = collection.tilesInGrid.filterIsInstance<WishGridItem.Group>()
        .find { it.group.id == openedGroup.value }
    LazyColumn(
        state = state,
        modifier = Modifier.widthIn(max = layout.contentWidth).fillMaxWidth(),
        contentPadding = PaddingValues(top = 12.dp, bottom = bottomPadding),
        verticalArrangement = Arrangement.spacedBy(PageGap),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(PageGap)) {
                Box(Modifier.fillMaxWidth().padding(horizontal = layout.inset), contentAlignment = Alignment.Center) {
                    identity()
                }
                if (collection.tiles.isNotEmpty()) {
                    LazyRow(
                        Modifier.fillMaxWidth(),
                        contentPadding = PaddingValues(horizontal = layout.inset),
                        horizontalArrangement = Arrangement.spacedBy(ControlGap),
                    ) {
                        items(collection.tiles, key = { it.id ?: "" }) { tile ->
                            WishListTile(tile, tile.id == collection.selected, mood, { selectList(tile.id); openedGroup.value = null })
                        }
                    }
                }
            }
        }
        if (collection.wishes.isEmpty()) {
            item {
                Column(
                    Modifier.fillMaxWidth().padding(PageGap),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(ControlGap),
                ) {
                    Icon(Icons.Default.FavoriteBorder, null, Modifier.size(32.dp))
                    Text("В этом списке пока пусто", style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
                    Text(emptyCopy, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
                }
            }
        }
        items(collection.tilesInGrid.chunked(layout.columns), key = { it.first().key }) { row ->
            WishGridRow(layout) { cardWidth ->
                row.forEach { tile ->
                    when (tile) {
                        is WishGridItem.Wish -> WishCard(tile.wish, { selectWish(tile.wish) }, Modifier.width(cardWidth), onWishShare)
                        is WishGridItem.Group -> GroupTile(tile, { openedGroup.value = tile.group.id }, Modifier.width(cardWidth))
                    }
                }
            }
        }
    }
    if (openGroup != null) {
        GroupDialog(openGroup, layout, { openedGroup.value = null }, selectWish, onWishShare)
    }
}

@Composable
private fun WishGridRow(layout: CollectionLayout, row: @Composable (Dp) -> Unit) {
    BoxWithConstraints(Modifier.fillMaxWidth().padding(horizontal = layout.inset)) {
        val cardWidth = (maxWidth - layout.columnGap * (layout.columns - 1)) / layout.columns
        Row(horizontalArrangement = Arrangement.spacedBy(layout.columnGap)) { row(cardWidth) }
    }
}

@Composable
private fun GroupDialog(
    tile: WishGridItem.Group,
    layout: CollectionLayout,
    onClose: () -> Unit,
    selectWish: (PublicWish) -> Unit,
    onWishShare: ((PublicWish) -> Unit)?,
) {
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize()) {
            Column {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = layout.inset, vertical = ControlGap),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(ControlGap),
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(tile.group.title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
                        Text(wishCount(tile.members.size), style = MaterialTheme.typography.bodySmall)
                    }
                    ChromeIconButton(Icons.Default.Close, "Закрыть группу", onClose)
                }
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(layout.rowGap),
                    contentPadding = PaddingValues(vertical = PageGap),
                ) {
                    items(tile.members.chunked(layout.columns), key = { it.first().id }) { row ->
                        WishGridRow(layout) { cardWidth ->
                            row.forEach { wish -> WishCard(wish, { selectWish(wish) }, Modifier.width(cardWidth), onWishShare) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun GroupTile(tile: WishGridItem.Group, onSelect: () -> Unit, modifier: Modifier) {
    Surface(onClick = onSelect, modifier = modifier, shape = RoundedCornerShape(20.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(ControlGap)) {
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = MaterialTheme.colorScheme.surfaceContainerHigh,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            ) {
                BoxWithConstraints(Modifier.fillMaxWidth().aspectRatio(wishAspect)) {
                    val inset = maxWidth * .12f
                    val gap = maxWidth * .05f
                    val itemWidth = (maxWidth - inset * 2 - gap) / 2
                    val itemHeight = (maxHeight - inset * 2 - gap) / 2
                    Column(Modifier.padding(inset), verticalArrangement = Arrangement.spacedBy(gap)) {
                        tile.members.take(4).chunked(2).forEach { members ->
                            Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                                members.forEach { wish ->
                                    Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surfaceContainerHigh) {
                                        Box(Modifier.size(itemWidth, itemHeight)) {
                                            if (wish.imageUrl != null) {
                                                AsyncImage(wish.imageUrl, null, Modifier.matchParentSize(), contentScale = ContentScale.Crop)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Column(Modifier.padding(bottom = ControlGap)) {
                Text(tile.group.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(wishCount(tile.members.size), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun WishListTile(tile: ListTile, selected: Boolean, mood: Int?, onSelect: () -> Unit) {
    val color = if (selected) when (mood) {
        1 -> Color(0xFFD86E9C)
        2 -> Color(0xFF7799ED)
        4 -> Color(0xFF42BF9D)
        5 -> Color(0xFFF2B84E)
        else -> null
    } else null
    val glow = if (color == null) Modifier else Modifier.drawWithCache {
        val brush = Brush.radialGradient(
            listOf(color, color.copy(alpha = .5f), Color.Transparent),
            center = Offset(size.width * .46f, size.height * 1.18f),
            radius = size.width * .84f,
        )
        onDrawBehind { drawRect(brush) }
    }
    Surface(
        selected = selected,
        onClick = onSelect,
        modifier = Modifier.width(130.dp).heightIn(min = 100.dp),
        color = when {
            color != null -> Color(0xFF101513)
            selected -> MaterialTheme.colorScheme.surfaceContainer
            else -> MaterialTheme.colorScheme.surfaceContainerHigh
        },
        contentColor = if (color != null) Color.White else MaterialTheme.colorScheme.onSurface,
        shape = RoundedCornerShape(18.dp),
        border = if (selected) BorderStroke(1.dp, color?.copy(alpha = .6f) ?: MaterialTheme.colorScheme.outline) else null,
    ) {
        Column(
            glow.padding(12.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(tile.title, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(
                tile.count.toString(),
                style = MaterialTheme.typography.headlineMedium,
                color = if (color != null) Color.White else if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.semantics { contentDescription = wishCount(tile.count) },
            )
        }
    }
}

private fun wishCount(count: Int): String = "$count ${wishCountNoun(count)}"

private fun wishCountNoun(count: Int): String = when {
    count % 10 == 1 && count % 100 != 11 -> "желание"
    count % 10 in 2..4 && count % 100 !in 12..14 -> "желания"
    else -> "желаний"
}

@Composable
internal fun ProfileIdentity(
    name: String,
    avatarUrl: String?,
    avatarSize: Dp = 96.dp,
    onProfile: (() -> Unit)? = null,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(if (avatarSize <= 112.dp) 12.dp else 16.dp),
    ) {
        val avatarModifier = Modifier.size(avatarSize)
        val shape = CircleShape
        val background = MaterialTheme.colorScheme.surfaceContainer
        if (onProfile == null) {
            Surface(avatarModifier, shape = shape, color = background) { AvatarImage(name, avatarUrl) }
        } else {
            Surface(
                onClick = onProfile,
                modifier = avatarModifier,
                shape = shape,
                color = background,
            ) { AvatarImage(name, avatarUrl) }
        }
        Text(
            name,
            modifier = Modifier.semantics { heading() },
            style = if (avatarSize == 96.dp) MaterialTheme.typography.headlineLarge else MaterialTheme.typography.displaySmall,
            textAlign = TextAlign.Center,
        )
    }
}

internal val CollectionLayout.avatarSize: Dp
    get() = when {
        width <= 560.dp -> 96.dp
        width <= 820.dp -> 112.dp
        else -> 160.dp
    }

@Composable
private fun AvatarImage(name: String, avatarUrl: String?) {
    Box(contentAlignment = Alignment.Center) {
        val initials = name.trim().split(Regex("\\s+")).take(2).joinToString("") { it.take(1) }.uppercase()
        Text(initials, style = MaterialTheme.typography.headlineMedium)
        if (avatarUrl != null) {
            AsyncImage(avatarUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
        }
    }
}

@Composable
private fun WishCard(wish: PublicWish, onSelect: () -> Unit, modifier: Modifier, onShare: ((PublicWish) -> Unit)?) {
    Box(modifier) {
        Surface(onClick = onSelect, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(ControlGap)) {
                Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
                    WishImage(wish, Modifier.fillMaxWidth().aspectRatio(wishAspect))
                }
                Column(Modifier.padding(bottom = ControlGap)) {
                    Text(wish.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    formattedPrice(wish)?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                }
            }
        }
        if (onShare != null) {
            var expanded by remember { mutableStateOf(false) }
            Box(Modifier.align(Alignment.TopEnd).padding(6.dp)) {
                ChromeIconButton(Icons.Default.MoreVert, "Действия с желанием «${wish.title}»", { expanded = true })
                DropdownMenu(expanded, onDismissRequest = { expanded = false }) {
                    DropdownMenuItem(text = { Text("Поделиться") }, onClick = { expanded = false; onShare(wish) })
                }
            }
        }
    }
}

private const val wishAspect = 236f / 286f

@Composable
internal fun WishImage(wish: PublicWish, modifier: Modifier = Modifier) {
    Box(modifier, contentAlignment = Alignment.Center) {
        Icon(painterResource(R.drawable.wishlist_gift), contentDescription = null, modifier = Modifier.size(36.dp))
        if (wish.imageUrl != null) {
            AsyncImage(wish.imageUrl, contentDescription = null, contentScale = ContentScale.Crop, alignment = Alignment.TopCenter, modifier = Modifier.matchParentSize())
        }
    }
}

internal fun formattedPrice(wish: PublicWish): String? {
    val amount = wish.price ?: return null
    val locale = Locale.forLanguageTag("ru-RU")
    return runCatching {
        NumberFormat.getCurrencyInstance(locale).apply { currency = Currency.getInstance(wish.currency) }.format(amount)
    }.getOrElse { NumberFormat.getNumberInstance(locale).format(amount) }
}
