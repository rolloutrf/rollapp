package ru.rollapp.android

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class PublicWishlistsTest {
    @Test
    fun resolvesCanonicalLocalizedAndSharedTargets() {
        assertEquals("/api/profile/Anna", parseWishlistTarget("@Anna")?.apiPath)
        val localized = parseWishlistTarget("Вишлист: https://роллапп.рф/Анна/списки/list-id")
        assertEquals("list-id", localized?.listId)
        assertEquals("$ROLLAPP_ORIGIN/%D0%90%D0%BD%D0%BD%D0%B0/lists/list-id", localized?.webUrl())
        assertEquals(WishSpace.Food, parseWishlistTarget("https://вишлист.роллапп.рф/Anna/еда")?.space)
        val shared = parseWishlistTarget("https://роллапп.рф/поделиться/token123/желания/wish-id")
        assertEquals("/api/shared/token123", shared?.apiPath)
        assertEquals("$ROLLAPP_ORIGIN/s/token123/wishes/wish-id", shared?.webUrl())
    }

    @Test
    fun rejectsForeignOriginsAndNonReaderRoutes() {
        listOf(
            "http://роллапп.рф/Anna", "https://rollapp.example/Anna",
            "$ROLLAPP_ORIGIN.evil.example/Anna", "$ROLLAPP_ORIGIN@evil.example/Anna",
            "$ROLLAPP_ORIGIN:443/Anna", "$ROLLAPP_ORIGIN/app/wishes",
            "$ROLLAPP_ORIGIN/api/profile/Anna", "$ROLLAPP_ORIGIN/s/token%2Fhidden",
            "$ROLLAPP_ORIGIN/s/token/../hidden", "$ROLLAPP_ORIGIN/%252e%252e",
            "$ROLLAPP_ORIGIN/Anna/calendar/book",
        ).forEach { input -> assertNull(input, parseWishlistTarget(input)) }
    }

    @Test
    fun keepsOnlyPublicListsAndVisibleActiveWishes() {
        val data = profileResponse().put("lists", JSONArray()
            .put(list("public-list", "public", "food"))
            .put(list("hidden-list", "private", "products")))
            .put("wishes", JSONArray()
                .put(wish("visible", "public-list").put("space", "products"))
                .put(wish("private-list", "hidden-list"))
                .put(wish("private-wish", "public-list").put("privacy", "private"))
                .put(wish("fulfilled", "public-list").put("status", "fulfilled")))
        val result = parseWishlist(data, WishlistTarget(profile = "anna"))
        assertEquals(listOf("public-list"), result.lists.map { it.id })
        assertEquals(listOf("visible"), result.visibleWishes(space = WishSpace.Food).map { it.id })
        assertEquals("$ROLLAPP_ORIGIN/api/media/example", result.wishes.single().imageUrl)
        assertNull(result.wishes.single().price)

        assertThrows(WishlistMissing::class.java) {
            parseWishlist(data, WishlistTarget(profile = "anna", listId = "hidden-list"))
        }
        assertThrows(WishlistMissing::class.java) {
            parseWishlist(data, WishlistTarget(profile = "anna", wishId = "private-wish"))
        }
    }

    @Test
    fun loadsOnlyTheListGrantedByTheShareToken() {
        val data = profileResponse().put("list", list("linked", "link", "products"))
            .put("wishes", JSONArray()
                .put(wish("included", "linked").put("price", 3200).put("imageUrl", "http://example.com/image.png"))
                .put(wish("unrelated", "elsewhere")))
        val result = parseWishlist(data, WishlistTarget(token = "opaque"))
        val included = result.wishes.single()
        assertEquals("Тестовый список", result.title)
        assertEquals("included", included.id)
        assertEquals(3200.0, included.price ?: -1.0, 0.0)
        assertNull(included.imageUrl)
        assertThrows(WishlistMissing::class.java) {
            parseWishlist(data.put("list", list("linked", "followers", "products")), WishlistTarget(token = "opaque"))
        }
    }

    @Test
    fun rendersGroupsAtFirstVisibleMemberAndRetainsSiblingListsForDirectLinks() {
        val data = profileResponse()
            .put("lists", JSONArray()
                .put(list("food", "public", "food"))
                .put(list("lifestyle", "public", "food").put("title", "Лайфстайл")))
            .put("wishes", JSONArray()
                .put(wish("first", "lifestyle"))
                .put(wish("interleaved", "lifestyle"))
                .put(wish("second", "lifestyle"))
                .put(wish("other-list", "food")))
            .put("groups", JSONArray().put(JSONObject()
                .put("id", "group").put("listId", "lifestyle").put("title", "Группа")
                .put("wishIds", JSONArray(listOf("first", "second", "hidden")))))
        val wishlist = parseWishlist(data, WishlistTarget(profile = "anna", listId = "lifestyle"))
        val selection = selectCollection(wishlist.lists, wishlist.wishes, WishSpace.Food, "lifestyle", groups = wishlist.groups)

        assertEquals(listOf("lifestyle", "food"), selection.tiles.map { it.id })
        assertEquals(listOf("group:group", "wish:interleaved"), selection.tilesInGrid.map { it.key })
        val group = selection.tilesInGrid.first() as WishGridItem.Group
        assertEquals(listOf("first", "second"), group.members.map { it.id })

        val sibling = selectCollection(wishlist.lists, wishlist.wishes, WishSpace.Food, "food", groups = wishlist.groups)
        assertEquals(listOf("wish:other-list"), sibling.tilesInGrid.map { it.key })
    }

    @Test
    fun opensCanonicalAndLocalizedPublicationLinksOnlyForRollappProfiles() {
        assertEquals(
            PublicationTarget("Anna", Publication.Calendar),
            parsePublication("$ROLLAPP_ORIGIN/Anna/calendar/book?slot=123"),
        )
        assertEquals(
            PublicationTarget("Анна", Publication.Announcements),
            parsePublication("Публикации: https://роллапп.рф/Анна/%D0%BF%D1%83%D0%B1%D0%BB%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D0%B8"),
        )
        assertNull(parsePublication("https://example.org/Anna/calendar"))
        assertNull(parsePublication("$ROLLAPP_ORIGIN/app/calendar"))
        assertNull(parsePublication("$ROLLAPP_ORIGIN/Anna%2Fother/calendar"))
    }

    private fun profileResponse(): JSONObject = JSONObject()
        .put("profile", JSONObject().put("name", "Анна").put("username", "anna"))

    private fun list(id: String, privacy: String, space: String): JSONObject = JSONObject()
        .put("id", id).put("title", "Тестовый список").put("privacy", privacy).put("space", space)

    private fun wish(id: String, listId: String): JSONObject = JSONObject()
        .put("id", id).put("title", "Желание").put("description", "")
        .put("status", "active").put("privacy", "inherit").put("price", JSONObject.NULL)
        .put("listIds", JSONArray().put(listId)).put("imageUrl", "/api/media/example")
}
