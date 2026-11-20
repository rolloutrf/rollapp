package ru.rollapp.android

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal const val WEB_HOME = "/app/wishes"

@Composable
internal fun RollappApp(
    sharedInput: ShareInput?,
    onShareConsumed: () -> Unit,
    session: LoginState,
    startLogin: () -> Unit,
    retrySession: () -> Unit,
    signOut: (NativeCredential) -> Unit,
    share: (String) -> Unit,
) {
    val credential = (session as? LoginState.Open)?.credential
    var request by rememberSaveable { mutableStateOf<String?>(null) }
    var publicSpace by rememberSaveable { mutableStateOf(WishSpace.Products) }
    var publicListId by rememberSaveable { mutableStateOf<String?>(null) }
    var detailId by rememberSaveable { mutableStateOf<String?>(null) }
    var personal by rememberSaveable { mutableStateOf(PersonalPage.Wishes) }
    var personalSpace by rememberSaveable { mutableStateOf(WishSpace.Products) }
    var lookup by rememberSaveable { mutableStateOf(false) }
    var personalWishId by rememberSaveable { mutableStateOf<String?>(null) }
    var editor by rememberSaveable { mutableStateOf<WishEditor?>(null) }
    var catalog by rememberSaveable { mutableStateOf<WishlistSection?>(null) }
    var checkout by rememberSaveable { mutableStateOf<String?>(null) }
    var publicationType by rememberSaveable { mutableStateOf<Publication?>(null) }
    var publicationProfile by rememberSaveable { mutableStateOf<String?>(null) }
    var loginRequested by rememberSaveable { mutableStateOf(false) }
    var wallet by rememberSaveable { mutableStateOf(false) }
    var account by rememberSaveable { mutableStateOf(false) }
    val publicTarget = request?.let(::parseWishlistTarget)
    val publicationStates = rememberSaveableStateHolder()
    val publication = publicationType?.let { type -> publicationProfile?.let { PublicationTarget(it, type) } }
    val inPersonal = credential != null && publicTarget == null && !lookup && !account && publication == null && !loginRequested
    LaunchedEffect(credential) {
        if (credential != null) loginRequested = false
    }

    fun closePublication() {
        publication?.let { publicationStates.removeState(it.endpoint) }
        publicationType = null
        publicationProfile = null
    }

    fun openPublication(target: PublicationTarget) {
        if (publication != target) closePublication()
        publicationType = target.section
        publicationProfile = target.profile
    }
    val showSpace = publicTarget != null && publicTarget.token == null ||
        inPersonal && personal == PersonalPage.Wishes
    val isPublicDetail = detailId != null || publicTarget?.wishId != null

    fun home() {
        personal = PersonalPage.Wishes
        account = false
        catalog = null
        checkout = null
        closePublication()
        loginRequested = false
        wallet = false
        personalWishId = null
        editor = null
        lookup = false
        request = null
        publicListId = null
        detailId = null
    }

    fun openTarget(target: WishlistTarget) {
        detailId = null
        lookup = false
        account = false
        publicListId = target.listId
        publicSpace = target.space ?: WishSpace.Products
        request = target.webUrl()
    }

    LaunchedEffect(sharedInput) {
        val incoming = sharedInput ?: return@LaunchedEffect
        val target = parseWishlistTarget(incoming.text)
        val publicPage = parsePublication(incoming.text)
        if (publicPage != null) {
            home()
            openTarget(WishlistTarget(profile = publicPage.profile))
            openPublication(publicPage)
        } else if (target == null) {
            home()
            lookup = true
        } else {
            openTarget(target)
        }
        onShareConsumed()
    }

    fun back() {
        when {
            loginRequested -> loginRequested = false
            publication != null -> closePublication()
            checkout != null -> checkout = null
            wallet -> wallet = false
            catalog == WishlistSection.Orders -> catalog = WishlistSection.Store
            catalog != null && publicTarget == null && !account && !lookup -> catalog = null
            detailId != null -> detailId = null
            publicTarget?.wishId != null -> openTarget(publicTarget.copy(wishId = null))
            publicTarget != null -> request = null
            editor != null -> editor = null
            personalWishId != null -> personalWishId = null
            account -> account = false
            lookup -> lookup = false
            else -> home()
        }
    }

    fun openModule(path: String) {
        val page = PersonalPage.forPath(path)
        if (path == "/app/rolls") {
            home()
            wallet = true
        } else if (page != null) {
            home()
            personal = page
        }
    }

    val canGoBack = loginRequested || publication != null || catalog != null || checkout != null || wallet || detailId != null || publicTarget != null || lookup || account || personal != PersonalPage.Wishes || personalWishId != null || editor != null
    BackHandler(enabled = canGoBack, onBack = ::back)

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val layout = CollectionLayout(maxWidth)
        val mobile = layout.mobile
        val mobilePlanning = mobile && inPersonal && personal == PersonalPage.Planning
        val showDetail = mobile && !loginRequested && publication == null &&
            (isPublicDetail || inPersonal && (personalWishId != null || editor != null || checkout != null))
        val sharePage = when {
            loginRequested -> null
            publication != null -> WishlistTarget(profile = publication.profile).webUrl() + "/${publication.section.segment}"
            wallet -> ROLLAPP_ORIGIN + "/app/rolls"
            publicTarget != null -> publicTarget.copy(listId = publicListId.takeIf { publicTarget.token == null })
                .webUrl(detailId ?: publicTarget.wishId)
            inPersonal -> ROLLAPP_ORIGIN + personal.webPath +
                if (personal == PersonalPage.Wishes) "?tab=${personalSpace.id}" else ""
            else -> null
        }
        val chrome = ChromeState(
            user = credential?.user,
            service = if (inPersonal) personal else PersonalPage.Wishes.takeIf { publicTarget != null },
            space = if (showSpace && !loginRequested && !wallet) { if (publicTarget != null) publicSpace else personalSpace } else null,
            onService = ::openModule,
            onSpace = { space ->
                if (publicTarget == null) {
                    personalSpace = space
                } else {
                    closePublication()
                    openTarget(publicTarget.copy(space = space, listId = null, wishId = null))
                }
            },
        )
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            topBar = {
                if (!showDetail && !mobilePlanning) RollappHeader(
                    layout = layout,
                    onHome = ::home,
                    chrome = chrome.takeUnless { mobile },
                    onShare = sharePage?.let { url -> { share(url) } },
                )
            },
            bottomBar = {
                if (mobile && !showDetail && !mobilePlanning) MobileDock(layout, chrome)
            },
        ) { insets ->
            Box(
                Modifier.fillMaxSize().padding(insets).consumeWindowInsets(insets).imePadding(),
                contentAlignment = Alignment.TopCenter,
            ) {
                when {
                    loginRequested && credential == null -> SignInScreen(session, startLogin, retrySession, layout)
                    publication != null -> publicationStates.SaveableStateProvider(publication.endpoint) {
                        var profileRevision by remember { mutableStateOf(0) }
                        val target = WishlistTarget(profile = publication.profile)
                        val profileData by nativeData(target.apiPath, credential, profileRevision)
                        val profile = (profileData as? NativeData.Ready)?.value?.let { raw ->
                            remember(raw) { runCatching { parseWishlist(raw, target) }.getOrNull() }
                        }
                        PublicationsScreen(publication, credential, layout, ::back, { loginRequested = true }) {
                            if (profile != null) PublicProfile(
                                profile, target, layout, credential, { loginRequested = true },
                                ::openPublication, share, onChanged = { profileRevision++ },
                                active = publication.section,
                            )
                        }
                    }
                    publicTarget != null -> WishlistScreen(
                        request = publicTarget,
                        layout = layout,
                        detailId = detailId,
                        selectWish = { detailId = it },
                        selectList = { list, space -> publicListId = list; publicSpace = space },
                        onBack = ::back,
                        onHome = ::home,
                        credential = credential,
                        onLogin = { loginRequested = true },
                        openPublication = ::openPublication,
                        share = share,
                    )
                    lookup -> WishlistLookupScreen(layout, ::back, ::openTarget)
                    account && credential != null -> AccountScreen(
                        credential, { home(); signOut(it) }, ::back, layout,
                        onSaved = { account = false; retrySession() },
                    )
                    inPersonal -> key(credential.user.id, personal, personalSpace) {
                        val activeSection = catalog
                        val selectedCat = checkout
                        val profileHeader: @Composable () -> Unit = {
                            PersonalProfile(
                                user = credential.user,
                                layout = layout,
                                onProfile = { account = true },
                                onFriends = { openModule(PersonalPage.Friends.webPath) },
                                onSection = { catalog = it },
                                onPublication = { openPublication(PublicationTarget(credential.user.username, it)) },
                                onPublic = { openTarget(WishlistTarget(profile = credential.user.username, space = personalSpace)) },
                                active = activeSection,
                            )
                        }
                        if (personal == PersonalPage.Planning) {
                            PlanningScreen(credential, layout, ::back)
                        } else if (wallet) {
                            WalletScreen(credential, layout)
                        } else if (selectedCat != null) {
                            CatCheckoutScreen(credential, selectedCat, layout, ::back)
                        } else if (activeSection != null) {
                            key(activeSection) {
                                CatalogScreen(
                                    activeSection, credential, personalSpace, layout, ::back,
                                    onOrders = { catalog = WishlistSection.Orders },
                                    onCheckout = { checkout = it },
                                    header = profileHeader,
                                )
                            }
                        } else if (personal == PersonalPage.Wishes) {
                            PersonalWishlistScreen(
                                credential, personalSpace, layout,
                                profileHeader = profileHeader,
                                share = share,
                                editor = editor,
                                showEditor = { editor = it },
                                wishId = personalWishId,
                                showWish = { personalWishId = it },
                            )
                        } else {
                            PersonalScreen(
                                page = personal,
                                login = session,
                                startLogin = startLogin,
                                retrySession = retrySession,
                                modifier = Modifier.widthIn(max = 720.dp).fillMaxSize(),
                            )
                        }
                    }
                    else -> SignInScreen(session, startLogin, retrySession, layout)
                }
            }
        }
    }
}

@Composable
internal fun Eyebrow(text: String) {
    Text(text, style = MaterialTheme.typography.labelMedium.copy(letterSpacing = 1.04.sp))
}

@Composable
internal fun SectionIntro(eyebrow: String, title: String) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Eyebrow(eyebrow.uppercase())
        Text(title, style = MaterialTheme.typography.headlineLarge, modifier = Modifier.semantics { heading() })
    }
}
