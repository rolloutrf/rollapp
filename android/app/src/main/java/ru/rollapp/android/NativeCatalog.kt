package ru.rollapp.android

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import org.json.JSONObject

internal enum class WishlistSection(val title: String) {
    Feed("Лента"), Brands("Каталог брендов"), Store("Магазин"), Offers("Предложения"), Orders("Заказы"),
}

@Composable
internal fun CatalogScreen(
    section: WishlistSection,
    credential: NativeCredential,
    space: WishSpace,
    layout: CollectionLayout,
    onBack: () -> Unit,
    onOrders: () -> Unit,
    onCheckout: (String) -> Unit,
    header: @Composable () -> Unit,
) {
    if (section == WishlistSection.Store) {
        NativeStore(space, layout, onOrders, onCheckout, header)
        return
    }
    val base = "/api/wishlist-business/${space.id}"
    var brand by rememberSaveable(space) { mutableStateOf<String?>(null) }
    var selected by rememberSaveable(section, space, brand) { mutableStateOf<String?>(null) }
    var revision by remember { mutableIntStateOf(0) }
    var offset by rememberSaveable(section, space, brand) { mutableIntStateOf(0) }
    val catalog = section == WishlistSection.Feed || section == WishlistSection.Brands && brand != null
    val page = when (section) {
        WishlistSection.Feed -> "/api/catalog?source=community&space=${space.id}&limit=24&offset=$offset"
        WishlistSection.Brands -> brand?.let { "$base/profiles/${segment(it)}" } ?: "$base/accounts"
        WishlistSection.Offers -> "$base/offers"
        WishlistSection.Orders -> "/api/rolls/orders"
        WishlistSection.Store -> error("Store is rendered separately")
    }
    val result by nativeData(page, credential, revision)
    val payload = (result as? NativeData.Ready)?.value
    val items = payload?.rows("items").orEmpty()
    val selectedItem = items.find { it.cleanString("id") == selected }
    val closeItem = { selected = null }
    BackHandler(enabled = selected != null || brand != null) {
        if (selected != null) selected = null else brand = null
    }
    if (selected != null) {
        val itemId = requireNotNull(selected)
        if (section == WishlistSection.Feed) {
            CatalogItemScreen(credential, itemId, layout, closeItem, onChanged = { revision++ })
        } else if (selectedItem != null) {
            ListingDetail(credential, base, section, selectedItem, layout, closeItem, onChanged = { revision++ })
        } else if (result is NativeData.Ready) {
            NativePage(layout) { NativeMessage("Позиция больше недоступна.") }
        } else {
            NativePage(layout) { DataContent(result, { revision++ }) {} }
        }
        return
    }

    NativePage(layout, maxWidth = 1024.dp + layout.inset * 2) {
        if (section != WishlistSection.Orders) header()
        NativeTitle(section.title)
        if (brand != null) {
            OutlinedButton(onClick = { brand = null }, modifier = Modifier.heightIn(min = ControlSize)) { Text("К каталогу брендов") }
        }
        DataContent(result, { revision++ }) { response ->
            if (section == WishlistSection.Brands && brand == null) {
                val accounts = response.rows("accounts")
                if (accounts.isEmpty()) NativeMessage("Брендов пока нет")
                accounts.forEach { account ->
                    val username = account.cleanString("username")
                    Surface(
                        onClick = { if (username.isNotBlank()) brand = username },
                        modifier = Modifier.fillMaxWidth().heightIn(min = ControlSize),
                        color = MaterialTheme.colorScheme.surfaceContainer,
                        shape = RoundedCornerShape(18.dp),
                    ) {
                        Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(ControlGap), verticalAlignment = Alignment.CenterVertically) {
                            resolveImage(account.cleanString("avatarUrl"))?.let {
                                AsyncImage(it, null, Modifier.size(40.dp), contentScale = ContentScale.Crop)
                            }
                            Text(account.cleanString("storefrontTitle").ifBlank { account.cleanString("name") })
                        }
                    }
                }
            } else if (section == WishlistSection.Orders) {
                val orders = response.rows("orders")
                if (orders.isEmpty()) NativeMessage("Заказов пока нет")
                orders.forEach { order ->
                    Column(verticalArrangement = Arrangement.spacedBy(ControlGap)) {
                        val name = order.cleanString("productTitle").ifBlank {
                            order.cleanString("itemTitle").ifBlank { order.cleanString("title") }
                        }
                        Text(name, style = MaterialTheme.typography.titleLarge)
                        order.cleanString("createdAt").takeIf(String::isNotBlank)?.let { NativeMessage(displayDate(it)) }
                        if (order.has("amount")) Text("${order.optLong("amount")} роллов")
                    }
                }
            } else {
                response.rows("pages").forEach { profile ->
                    Text(profile.cleanString("title"), style = MaterialTheme.typography.titleLarge)
                    profile.cleanString("description").takeIf(String::isNotBlank)?.let { Text(it) }
                }
                if (items.isEmpty()) {
                    NativeMessage(if (section == WishlistSection.Offers) "Предложений пока нет" else "В этом разделе пока пусто")
                }
                CatalogGrid(layout, items) { selected = it.cleanString("id") }
                if (catalog && (offset > 0 || response.optInt("total") > offset + items.size)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(ControlGap)) {
                        OutlinedButton(onClick = { offset = (offset - 24).coerceAtLeast(0) }, enabled = offset > 0) { Text("Назад") }
                        OutlinedButton(onClick = { offset += 24 }, enabled = response.optInt("total") > offset + items.size) { Text("Дальше") }
                    }
                }
            }
        }
    }
}

@Composable
internal fun CatalogGrid(layout: CollectionLayout, items: List<JSONObject>, open: (JSONObject) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(layout.rowGap)) {
        items.chunked(layout.columns).forEach { row ->
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                val width = (maxWidth - layout.columnGap * (layout.columns - 1)) / layout.columns
                Row(horizontalArrangement = Arrangement.spacedBy(layout.columnGap)) {
                    row.forEach { item ->
                        key(item.cleanString("id")) {
                            Surface(
                                onClick = { open(item) },
                                modifier = Modifier.width(width),
                                shape = RoundedCornerShape(18.dp),
                            ) {
                                Column(verticalArrangement = Arrangement.spacedBy(ControlGap)) {
                                    ItemImage(item, 236f / 286f)
                                    Text(item.cleanString("title"), maxLines = 2, overflow = TextOverflow.Ellipsis)
                                    itemPrice(item)?.let { NativeMessage(it) }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun itemPrice(item: JSONObject): String? {
    if (item.has("priceRolls")) return "${item.optLong("priceRolls")} роллов"
    val value = item.optDouble("price")
    if (!value.isFinite()) return null
    val currency = item.cleanString("currency").ifBlank { "RUB" }
    return runCatching {
        java.text.NumberFormat.getCurrencyInstance(java.util.Locale.forLanguageTag("ru-RU")).apply {
            this.currency = java.util.Currency.getInstance(currency)
        }.format(value)
    }.getOrDefault(value.toString())
}

@Composable
private fun ItemImage(item: JSONObject, ratio: Float) {
    Surface(
        Modifier.fillMaxWidth().aspectRatio(ratio),
        color = MaterialTheme.colorScheme.surfaceContainer,
        shape = RoundedCornerShape(18.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            val image = resolveImage(item.cleanString("imageUrl"))
            if (image != null) AsyncImage(image, null, Modifier.matchParentSize(), contentScale = ContentScale.Crop)
            else androidx.compose.material3.Icon(
                androidx.compose.ui.res.painterResource(R.drawable.wishlist_gift), null, Modifier.size(32.dp),
            )
        }
    }
}

@Composable
private fun CatalogItemScreen(credential: NativeCredential, id: String, layout: CollectionLayout, onBack: () -> Unit, onChanged: () -> Unit) {
    var revision by remember { mutableIntStateOf(0) }
    val data by nativeData("/api/catalog/items/${segment(id)}", credential, revision)
    val operation = rememberNativeMutation()
    val item = (data as? NativeData.Ready)?.value?.optJSONObject("item")
    val added = item?.optBoolean("addedByMe") == true
    NativePage(layout, maxWidth = 576.dp, footer = {
        NativeFooter(onBack, if (added) "Убрать из вишлиста" else "В вишлист", item != null && !operation.busy, {
            operation.run {
                val payload = JSONObject().put("itemId", id)
                if (added) payload.put("wishId", item?.cleanString("addedWishId"))
                credential.request(if (added) "/api/catalog/items/remove" else "/api/catalog/items/add", payload)
                revision++
                onChanged()
            }
        })
    }) {
        operation.error?.let { NativeMessage(it, error = true) }
        DataContent(data, { revision++ }) {
            if (item == null) NativeMessage("Позиция каталога не найдена") else ListingBody(item)
        }
    }
}

@Composable
private fun ListingBody(item: JSONObject) {
    ItemImage(item, 1f)
    NativeTitle(item.cleanString("title"))
    itemPrice(item)?.let { Text(it, style = MaterialTheme.typography.titleLarge) }
    item.optJSONObject("business")?.cleanString("name")?.takeIf(String::isNotBlank)?.let { NativeMessage(it) }
    item.cleanString("description").takeIf(String::isNotBlank)?.let { Text(it) }
}

@Composable
private fun ListingDetail(
    credential: NativeCredential, base: String, section: WishlistSection, item: JSONObject, layout: CollectionLayout,
    onBack: () -> Unit, onChanged: () -> Unit,
) {
    val operation = rememberNativeMutation()
    val offerId = item.cleanString("offerId")
    var confirm by rememberSaveable { mutableStateOf(false) }
    val uri = androidx.compose.ui.platform.LocalUriHandler.current
    val external = resolveImage(item.cleanString("actionUrl"))?.takeIf { !isRollappUrl(it) }
    NativePage(layout, maxWidth = 576.dp, footer = {
        if (section == WishlistSection.Offers && offerId.isNotBlank()) {
            NativeFooter(onBack, "Скрыть предложение", !operation.busy, { confirm = true })
        } else {
            NativeFooter(onBack, "К продавцу", external != null, { external?.let(uri::openUri) })
        }
    }) {
        ListingBody(item)
        item.optJSONObject("personalOffer")?.let { offer ->
            Text("Персональное предложение", style = MaterialTheme.typography.titleLarge)
            itemPrice(offer)?.let { Text(it) }
        }
        operation.error?.let { NativeMessage(it, error = true) }
    }
    if (confirm) androidx.compose.material3.AlertDialog(
        onDismissRequest = { confirm = false },
        title = { Text("Скрыть предложение?") },
        confirmButton = {
            Button(onClick = {
                confirm = false
                operation.run {
                    credential.request("$base/offers/${segment(offerId)}", method = "DELETE")
                    onChanged()
                    onBack()
                }
            }) { Text("Скрыть") }
        },
        dismissButton = {
            OutlinedButton(onClick = { confirm = false }) { Text("Отмена") }
        },
    )
}
