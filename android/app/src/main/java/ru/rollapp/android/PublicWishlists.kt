package ru.rollapp.android

import java.io.IOException
import java.net.URI
import java.net.URLEncoder
import org.json.JSONArray
import org.json.JSONObject

internal const val ROLLAPP_ORIGIN = "https://xn--80avakiab.xn--p1ai"

internal enum class WishSpace(val id: String, val localPath: String, val label: String) {
    Products("products", "товары", "Товары"),
    Places("places", "места", "Места"),
    Events("events", "события", "События"),
    Media("media", "медиа", "Медиа"),
    Food("food", "еда", "Еда"),
    Transport("transport", "транспорт", "Транспорт"),
}

private val rollappHosts = setOf(
    "xn--80avakiab.xn--p1ai", "роллапп.рф",
    "xn--b1amal5ag2b.xn--80avakiab.xn--p1ai", "вишлист.роллапп.рф",
)
private val identifier = Regex("[\\p{L}\\p{N}_-]{1,96}")
private val reserved = setOf("api", "app", "приложение", "login", "вход", "register", "регистрация", "s", "поделиться")
private val sharedUrl = Regex("https://[^\\s<>]+", RegexOption.IGNORE_CASE)

private fun rollappUri(raw: String): URI? = runCatching { URI(raw) }.getOrNull()?.takeIf { uri ->
    uri.scheme.equals("https", true) && uri.rawAuthority?.lowercase() in rollappHosts
}

internal fun isRollappUrl(raw: String): Boolean = rollappUri(raw) != null

internal data class WishlistTarget(
    val profile: String? = null,
    val token: String? = null,
    val space: WishSpace? = null,
    val listId: String? = null,
    val wishId: String? = null,
) {
    val apiPath: String
        get() = if (token != null) "/api/shared/${segment(token)}" else "/api/profile/${segment(requireNotNull(profile))}"

    fun webUrl(wish: String? = wishId): String {
        val base = if (token != null) "/s/${segment(token)}" else "/${segment(requireNotNull(profile))}"
        val suffix = when {
            wish != null -> "/wishes/${segment(wish)}"
            listId != null -> "/lists/${segment(listId)}"
            space != null -> "/${space.id}"
            else -> ""
        }
        return ROLLAPP_ORIGIN + base + suffix
    }
}

internal fun parseWishlistTarget(input: String): WishlistTarget? {
    val value = input.trim()
    if (value.length !in 1..2048) return null
    val handle = value.removePrefix("@")
    if (identifier.matches(handle) && handle.lowercase() !in reserved) return WishlistTarget(profile = handle)
    val raw = sharedUrl.find(value)?.value?.trimEnd('.', ',', ')', ']', '!', ';') ?: return null
    val uri = rollappUri(raw) ?: return null
    val path = uri.path?.removePrefix("/")?.removeSuffix("/") ?: return null
    if (Regex("%(?:2f|5c)", RegexOption.IGNORE_CASE).containsMatchIn(uri.rawPath)) return null
    val parts = path.split("/")
    if (parts.any { !identifier.matches(it) }) return null
    val first = parts[0]
    if (first in setOf("s", "поделиться")) {
        return when {
            parts.size == 2 -> WishlistTarget(token = parts[1])
            parts.size == 4 && parts[2] in setOf("wishes", "желания") -> WishlistTarget(token = parts[1], wishId = parts[3])
            else -> null
        }
    }
    if (first.lowercase() in reserved) return null
    return when (parts.size) {
        1 -> WishlistTarget(profile = first)
        2 -> WishSpace.entries.firstOrNull { parts[1] in setOf(it.id, it.localPath) }
            ?.let { WishlistTarget(profile = first, space = it) }
        3 -> when (parts[1]) {
            "lists", "списки" -> WishlistTarget(profile = first, listId = parts[2])
            "wishes", "желания" -> WishlistTarget(profile = first, wishId = parts[2])
            else -> null
        }
        else -> null
    }
}

internal fun segment(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")

internal data class PublicWish(
    val id: String,
    val title: String,
    val description: String,
    val imageUrl: String?,
    val price: Double?,
    val currency: String,
    val listIds: Set<String>,
    val space: WishSpace?,
    val url: String? = null,
    val privacy: String = "inherit",
    val reservedByMe: Boolean = false,
    val reservationCount: Int = 0,
    val allowMultiple: Boolean = false,
    val likedByMe: Boolean = false,
)

internal data class PublicList(val id: String, val title: String, val space: WishSpace?, val general: Boolean = false, val privacy: String = "public")

internal data class WishGroup(val id: String, val listId: String, val title: String, val space: WishSpace?, val wishIds: Set<String>)

internal data class PublicWishlist(
    val name: String,
    val username: String,
    val title: String?,
    val lists: List<PublicList>,
    val wishes: List<PublicWish>,
    val avatarUrl: String? = null,
    val followingCount: Int? = null,
    val followersCount: Int? = null,
    val bio: String? = null,
    val groups: List<WishGroup> = emptyList(),
    val mood: Int? = null,
    val isOwner: Boolean = false,
    val isFollowing: Boolean = false,
) {
    fun visibleWishes(list: String? = null, space: WishSpace? = null): List<PublicWish> =
        wishes.filter { wish ->
            (list == null || list in wish.listIds) &&
                (space == null || wish.space == space || lists.any { it.space == space && it.id in wish.listIds })
        }
}

internal class WishlistMissing : IOException()

internal suspend fun fetchWishlist(target: WishlistTarget, credential: NativeCredential? = null): PublicWishlist =
    try {
        val data = if (credential == null) requestNativeJson(target.apiPath).json else credential.request(target.apiPath)
        parseWishlist(data, target)
    } catch (error: NativeHttpError) {
        if (error.status == 404) throw WishlistMissing()
        throw error
    }

internal fun parseWishlist(body: JSONObject, target: WishlistTarget): PublicWishlist {
    val profile = body.getJSONObject("profile")
    val lists = if (target.token != null) {
        val shared = body.getJSONObject("list")
        if (shared.optString("privacy") !in setOf("link", "public")) throw WishlistMissing()
        listOf(shared.toPublicList())
    } else {
        body.getJSONArray("lists").objects().filter { it.optString("privacy") == "public" }.map { it.toPublicList() }
    }
    val selected = target.listId?.let { listId -> lists.find { it.id == listId } ?: throw WishlistMissing() }
    val listIds = lists.map { it.id }.toSet()
    val wishes = body.getJSONArray("wishes").objects().mapNotNull { wish ->
        if (wish.optString("status") != "active" || wish.optString("privacy") == "private") return@mapNotNull null
        val idsFromResponse = wish.getJSONArray("listIds").let { array ->
            (0 until array.length()).map { array.getString(it) }
        }
        val ids = idsFromResponse.filter { it in listIds }.toSet()
        if (idsFromResponse.isNotEmpty() && ids.isEmpty()) return@mapNotNull null
        if (target.token != null && lists.single().id !in ids) return@mapNotNull null
        wish.toWish(ids)
    }.distinctBy { it.id }
    val result = PublicWishlist(profile.getString("name"), profile.getString("username"),
        selected?.title ?: if (target.token != null) lists.single().title else null,
        lists, wishes,
        avatarUrl = resolveImage(profile.cleanString("avatarUrl")),
        followingCount = (body.opt("followingCount") as? Number)?.toInt(),
        followersCount = (body.opt("followersCount") as? Number)?.toInt(),
        bio = profile.cleanString("bio").takeIf { profile.optString("accountType") == "business" && it.isNotBlank() },
        groups = body.wishGroups().filter { it.listId in listIds },
        mood = (profile.opt("publicMood") as? Number)?.toInt(),
        isOwner = body.optBoolean("isOwner"),
        isFollowing = body.optBoolean("isFollowing"),
    )
    if (target.wishId != null && result.wishes.none { it.id == target.wishId }) throw WishlistMissing()
    return result
}

internal fun resolveImage(raw: String): String? {
    if (raw.isBlank()) return null
    val uri = runCatching { URI(ROLLAPP_ORIGIN).resolve(raw) }.getOrNull() ?: return null
    return uri.toString().takeIf { uri.scheme == "https" && uri.host != null && uri.userInfo == null }
}

private fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }
internal fun JSONObject.cleanString(key: String): String = if (isNull(key)) "" else optString(key)
private fun JSONObject.space(): WishSpace? = WishSpace.entries.firstOrNull { it.id == optString("space") }
internal fun JSONObject.toPublicList(): PublicList {
    val title = getString("title")
    val general = title == "Мои желания" && optString("description") == "Всё, чему я буду рад"
    return PublicList(getString("id"), title, space(), general, optString("privacy", "public"))
}

internal fun JSONObject.toWish(listIds: Set<String> = optJSONArray("listIds").stringSet()): PublicWish = PublicWish(
    id = getString("id"),
    title = getString("title"),
    description = cleanString("description"),
    imageUrl = resolveImage(cleanString("imageUrl")),
    price = optDouble("price").takeIf { it.isFinite() && it >= 0 },
    currency = cleanString("currency"),
    listIds = listIds,
    space = space(),
    url = cleanString("url").takeIf(String::isNotBlank),
    privacy = optString("privacy", "inherit"),
    reservedByMe = optBoolean("reservedByMe"),
    reservationCount = optInt("reservationCount"),
    allowMultiple = optBoolean("allowMultiple"),
    likedByMe = optBoolean("likedByMe"),
)

private fun JSONArray?.stringSet(): Set<String> = if (this == null) emptySet() else
    (0 until length()).mapTo(mutableSetOf()) { getString(it) }

internal fun JSONObject.wishGroups(): List<WishGroup> = optJSONArray("groups")?.objects().orEmpty().map { group ->
    WishGroup(
        id = group.getString("id"),
        listId = group.getString("listId"),
        title = group.getString("title"),
        space = group.space(),
        wishIds = group.optJSONArray("wishIds").stringSet(),
    )
}
