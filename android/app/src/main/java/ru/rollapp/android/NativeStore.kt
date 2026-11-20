package ru.rollapp.android

import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.UUID

private const val catPrice = 1000
private val rejectedPurchaseCodes = setOf("INVALID_PURCHASE", "PRODUCT_NOT_FOUND", "INVALID_PICKUP_POINT", "INSUFFICIENT_ROLLS", "PRICE_CHANGED")

private val cats = listOf(
    Triple("red", "Красный кот — Злой", "red-angry.webp"),
    Triple("white", "Белый кот — Милаха", "white-cute.webp"),
    Triple("blue", "Синий кот — Уставший", "blue-tired.webp"),
    Triple("pink", "Розовый кот — Влюблён", "pink-in-love.webp"),
    Triple("black", "Чёрный кот — Крутой", "black-cool.webp"),
    Triple("gold", "Золотой кот", "gold.png"),
)

private fun pendingPurchase(context: Context, userId: String): JSONObject? {
    val raw = context.getSharedPreferences("native-purchases", Context.MODE_PRIVATE).getString(userId, null)
    return raw?.let { runCatching { JSONObject(it) }.getOrNull() }
}

@Composable
internal fun NativeStore(
    space: WishSpace,
    layout: CollectionLayout,
    onOrders: () -> Unit,
    onCheckout: (String) -> Unit,
    header: @Composable () -> Unit,
) {
    NativePage(layout, maxWidth = 1024.dp + layout.inset * 2) {
        header()
        NativeTitle("Магазин")
        OutlinedButton(onClick = onOrders, modifier = Modifier.heightIn(min = ControlSize)) { Text("Заказы") }
        if (space == WishSpace.Products) {
            val items = remember {
                cats.map { (id, title, image) ->
                    JSONObject().put("id", id).put("title", title).put("imageUrl", "/store/cats/$image").put("priceRolls", catPrice)
                }
            }
            CatalogGrid(layout, items) { onCheckout(it.getString("id")) }
        } else {
            Text("В этом разделе магазина пока пусто", style = MaterialTheme.typography.titleLarge)
            NativeMessage("Новые товары появятся здесь.")
        }
    }
}

@Composable
internal fun CatCheckoutScreen(credential: NativeCredential, catId: String, layout: CollectionLayout, onBack: () -> Unit) {
    val context = LocalContext.current
    val preferences = remember(context) { context.getSharedPreferences("native-purchases", Context.MODE_PRIVATE) }
    val account = credential.user.id
    var pending by remember(account) { mutableStateOf(pendingPurchase(context, account)) }
    val currentCatId = pending?.cleanString("productId")?.removePrefix("cat:") ?: catId
    val cat = cats.find { it.first == currentCatId }
    val operation = rememberNativeMutation()
    var receipt by remember { mutableStateOf<String?>(null) }
    var city by rememberSaveable { mutableStateOf<String?>(null) }
    var cityQuery by rememberSaveable { mutableStateOf("") }
    var addressQuery by rememberSaveable { mutableStateOf("") }
    var appliedQuery by rememberSaveable { mutableStateOf("") }
    var pointCode by rememberSaveable { mutableStateOf<String?>(null) }
    var pointName by rememberSaveable { mutableStateOf("") }
    var revision by remember { mutableIntStateOf(0) }
    var offset by rememberSaveable { mutableIntStateOf(0) }

    fun close() {
        if (!operation.busy) onBack()
    }
    BackHandler(onBack = ::close)

    suspend fun finish(result: JSONObject, intent: JSONObject, statusRead: Boolean) {
        val purchase = result.optJSONObject("purchase") ?: error("Missing purchase")
        val code = purchase.optJSONObject("delivery")?.optJSONObject("point")?.cleanString("code")
        check(purchase.cleanString("id").isNotBlank() && code == intent.cleanString("pickupPointCode"))
        if (statusRead) {
            check(purchase.cleanString("productId") == intent.cleanString("productId"))
            check(purchase.optInt("amount") == intent.optInt("expectedPrice"))
            check(purchase.cleanString("status") in setOf("placed", "refunded"))
        }
        withContext(Dispatchers.IO) { check(preferences.edit().remove(account).commit()) }
        receipt = if (purchase.cleanString("status") == "refunded") "Роллы возвращены" else "Кот куплен"
        pending = null
    }

    fun submit(intent: JSONObject) {
        operation.run {
            withContext(Dispatchers.IO) { check(preferences.edit().putString(account, intent.toString()).commit()) }
            pending = intent
            try {
                finish(credential.request("/api/rolls/purchases", intent), intent, statusRead = false)
            } catch (error: NativeHttpError) {
                if (error.code in rejectedPurchaseCodes) {
                    withContext(Dispatchers.IO) { check(preferences.edit().remove(account).commit()) }
                    pending = null
                    if (error.code == "INVALID_PICKUP_POINT") {
                        pointCode = null
                        revision++
                    }
                }
                throw error
            }
        }
    }

    val deferred = pending
    val selectedPoint = pointCode
    if (cat == null) {
        NativePage(layout) { NativeMessage("Товар больше недоступен") }
        return
    }
    NativePage(layout, maxWidth = 576.dp, footer = {
        when {
            receipt != null -> NativeFooter(::close, "Готово", !operation.busy, ::close)
            deferred != null -> NativeFooter(::close, "Проверить покупку", !operation.busy, {
                operation.run {
                    val key = segment(deferred.getString("idempotencyKey"))
                    val result = credential.request("/api/rolls/purchases/$key")
                    if (result.optJSONObject("purchase") == null) throw NativeHttpError(404, "Покупка пока не найдена.")
                    finish(result, deferred, statusRead = true)
                }
            })
            selectedPoint != null -> NativeFooter(::close, "Оплатить $catPrice роллов", !operation.busy, {
                submit(
                    JSONObject().put("productId", "cat:${cat.first}").put("expectedPrice", catPrice)
                        .put("pickupPointCode", selectedPoint).put("idempotencyKey", UUID.randomUUID().toString()),
                )
            })
        }
    }) {
        if (receipt == null && deferred == null && selectedPoint == null) {
            OutlinedButton(onClick = ::close, modifier = Modifier.heightIn(min = ControlSize)) { Text("Назад") }
        }
        NativeTitle(receipt ?: if (deferred != null || selectedPoint != null) "Подтвердите покупку" else "Выберите пункт CDEK")
        Text(cat.second, style = MaterialTheme.typography.titleLarge)
        Text("$catPrice роллов")
        operation.error?.let { NativeMessage(it, error = true) }
        when {
            receipt != null -> NativeMessage("Статус покупки сохранён в заказах.")
            deferred != null -> {
                NativeMessage("Есть покупка, которую нужно проверить.")
                Text("Пункт выдачи ${deferred.cleanString("pickupPointCode")}")
                OutlinedButton(onClick = { submit(deferred) }, enabled = !operation.busy, modifier = Modifier.heightIn(min = ControlSize)) {
                    Text("Повторить с тем же номером заказа")
                }
            }
            selectedPoint != null -> {
                NativeMessage("Шаг 2 из 2 · Проверьте товар и пункт выдачи.")
                Text(pointName)
                OutlinedButton(onClick = { pointCode = null }, enabled = !operation.busy) { Text("Изменить пункт выдачи") }
            }
            else -> {
                NativeMessage("Шаг 1 из 2 · Найдите удобный пункт выдачи.")
                val cityCode = city
                if (cityCode == null) {
                    val cities by nativeData("/api/delivery/cdek/cities", credential, revision)
                    FormField(cityQuery, { cityQuery = it }, "Город", 100)
                    DataContent(cities, { revision++ }) { response ->
                        val matching = response.rows("cities").filter { it.cleanString("name").contains(cityQuery.trim(), ignoreCase = true) }
                        if (matching.isEmpty()) NativeMessage("Город не найден")
                        matching.take(20).forEach { item ->
                            OutlinedButton(onClick = {
                                city = item.get("code").toString()
                                offset = 0
                            }, modifier = Modifier.fillMaxWidth().heightIn(min = ControlSize)) {
                                Text(item.cleanString("label").ifBlank { item.cleanString("name") })
                            }
                        }
                    }
                } else {
                    val base = "/api/delivery/cdek/points?cityCode=${segment(cityCode)}&q=${segment(appliedQuery)}"
                    val points by nativeData("$base&offset=$offset&limit=20", credential, revision)
                    OutlinedButton(onClick = { city = null; addressQuery = ""; appliedQuery = ""; offset = 0 }) { Text("Выбрать другой город") }
                    FormField(addressQuery, { addressQuery = it }, "Адрес", 100)
                    Button(onClick = { appliedQuery = addressQuery.trim(); offset = 0 }) { Text("Найти") }
                    DataContent(points, { revision++ }) { response ->
                        val rows = response.rows("points")
                        if (rows.isEmpty()) NativeMessage("Пункты выдачи не найдены")
                        rows.forEach { item ->
                            val address = item.cleanString("address").ifBlank { item.cleanString("name") }
                            OutlinedButton(onClick = {
                                pointName = address
                                pointCode = item.get("code").toString()
                            }, modifier = Modifier.fillMaxWidth().heightIn(min = ControlSize)) { Text(address) }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(ControlGap)) {
                            if (offset > 0) OutlinedButton(onClick = { offset -= 20 }) { Text("Назад") }
                            if (rows.size == 20) OutlinedButton(onClick = { offset += 20 }) { Text("Дальше") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun WalletScreen(credential: NativeCredential, layout: CollectionLayout) {
    var revision by remember { mutableIntStateOf(0) }
    var offset by rememberSaveable { mutableIntStateOf(0) }
    val data by nativeData("/api/rolls?offset=$offset", credential, revision)
    NativePage(layout) {
        NativeTitle("Роллы")
        DataContent(data, { revision++ }) { response ->
            Text("${response.optLong("balance")} роллов", style = MaterialTheme.typography.displaySmall)
            Text("История операций", style = MaterialTheme.typography.titleLarge)
            val items = response.rows("transactions")
            if (items.isEmpty()) NativeMessage("Операций пока нет")
            items.forEach { item ->
                Column(verticalArrangement = Arrangement.spacedBy(ControlGap)) {
                    val note = item.cleanString("description").ifBlank { item.cleanString("note") }
                    Text(note.ifBlank { "Операция" })
                    Text("${item.optLong("amount")} роллов")
                    item.cleanString("createdAt").takeIf(String::isNotBlank)?.let { NativeMessage(displayDate(it)) }
                }
            }
            val next = response.optInt("nextOffset", -1)
            if (next > offset) OutlinedButton(onClick = { offset = next }) { Text("Дальше") }
        }
    }
}
