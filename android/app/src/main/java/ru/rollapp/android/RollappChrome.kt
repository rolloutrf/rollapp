package ru.rollapp.android

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties

internal val ControlSize = 48.dp
internal val ControlIconSize = 20.dp
internal val ControlGap = 8.dp
internal val PageGap = 24.dp

internal class CollectionLayout(val width: Dp) {
    val inset = when {
        width <= 640.dp -> 16.dp
        width <= 1180.dp -> 24.dp
        else -> 32.dp
    }
    val columns = when {
        width <= 640.dp -> 2
        width < 1024.dp -> 3
        else -> 4
    }
    val columnGap = if (width <= 640.dp) ControlGap else PageGap
    val rowGap = if (width <= 640.dp) 32.dp else 48.dp
    val mobile = width < 768.dp
    val contentWidth = 1024.dp + inset * 2
    val chromeWidth = 1280.dp + inset * 2
}

internal data class ChromeState(
    val user: NativeUser?,
    val service: PersonalPage?,
    val space: WishSpace?,
    val onService: (String) -> Unit,
    val onSpace: (WishSpace) -> Unit,
)

private data class Service(val label: String, val path: String)

private val wishlistService = Service("Вишлист", WEB_HOME)
private val privateServices = listOf(
    Service("Идентичность", PersonalPage.Identity.webPath),
    Service("Здоровье", PersonalPage.Health.webPath),
    wishlistService,
    Service("Образование", PersonalPage.Education.webPath),
    Service("Карьера", PersonalPage.Career.webPath),
)

@Composable
internal fun RollappHeader(
    layout: CollectionLayout,
    onHome: () -> Unit,
    chrome: ChromeState?,
    onShare: (() -> Unit)?,
) {
    Box(Modifier.fillMaxWidth().statusBarsPadding(), contentAlignment = Alignment.Center) {
        Row(
            Modifier.windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal))
                .widthIn(max = layout.chromeWidth).fillMaxWidth()
                .padding(horizontal = layout.inset)
                .padding(top = if (layout.width <= 560.dp) 8.dp else 24.dp, bottom = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(ControlGap),
        ) {
            IconButton(onClick = onHome, modifier = Modifier.size(ControlSize)) {
                Icon(
                    painterResource(R.drawable.rollapp_logo), "Rollapp — в приложение",
                    Modifier.size(34.dp),
                )
            }
            if (chrome != null) {
                SphereSwitcher(chrome, docked = false, panelWidth = 320.dp)
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                if (chrome?.space != null) {
                    SpaceSelector(chrome.space, chrome.onSpace, Modifier.widthIn(max = 320.dp), docked = false)
                }
            }
            if (onShare != null) ChromeIconButton(Icons.Default.Share, "Поделиться", onShare)
        }
    }
}

@Composable
internal fun MobileDock(layout: CollectionLayout, chrome: ChromeState) {
    Row(
        Modifier.fillMaxWidth().navigationBarsPadding()
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal))
            .padding(horizontal = layout.inset)
            .padding(top = ControlGap, bottom = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ControlGap),
    ) {
        SphereSwitcher(chrome, docked = true, panelWidth = layout.width - layout.inset * 2)
        Box(Modifier.weight(1f)) {
            if (chrome.space != null) {
                SpaceSelector(chrome.space, chrome.onSpace, Modifier.fillMaxWidth(), docked = true)
            }
        }
        if (chrome.user != null) {
            ChromeIconButton(Icons.Default.DateRange, "Планирование", { chrome.onService(PersonalPage.Planning.webPath) })
        }
    }
}

@Composable
internal fun ChromeIconButton(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    selected: Boolean = false,
) {
    OutlinedIconButton(
        onClick = onClick,
        modifier = Modifier.size(ControlSize),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        colors = IconButtonDefaults.outlinedIconButtonColors(
            containerColor = if (selected) MaterialTheme.colorScheme.secondaryContainer
                else MaterialTheme.colorScheme.surfaceContainer,
        ),
    ) {
        Icon(icon, label, Modifier.size(ControlIconSize))
    }
}

@Composable
private fun SphereSwitcher(chrome: ChromeState, docked: Boolean, panelWidth: Dp) {
    var expanded by remember { mutableStateOf(false) }
    val services = when {
        chrome.user?.canDiscoverSpheres == true -> privateServices
        chrome.user != null -> listOf(wishlistService, Service("Роллы", "/app/rolls"))
        else -> listOf(wishlistService)
    }
    Box {
        OutlinedIconButton(
            onClick = { expanded = true },
            modifier = Modifier.size(ControlSize).semantics { contentDescription = "Открыть переключатель сфер" },
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            colors = IconButtonDefaults.outlinedIconButtonColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
        ) {
            val color = MaterialTheme.colorScheme.onSurface
            Canvas(Modifier.size(ControlIconSize)) {
                val unit = size.width / 24
                for (x in listOf(3.25f, 14.25f)) {
                    for (y in listOf(3.25f, 14.25f)) {
                        drawRoundRect(
                            color = color,
                            topLeft = Offset(x * unit, y * unit),
                            size = Size(6.5f * unit, 6.5f * unit),
                            cornerRadius = CornerRadius(2.25f * unit),
                            style = Stroke(1.6f * unit),
                        )
                    }
                }
            }
        }
        if (expanded) {
            val gap = with(LocalDensity.current) { 8.dp.roundToPx() }
            val position = remember(docked, gap) { DockPopupPosition(docked, gap) }
            Popup(position, onDismissRequest = { expanded = false }, properties = PopupProperties(focusable = true)) {
                Surface(
                    Modifier.width(panelWidth).heightIn(max = 300.dp),
                    shape = RoundedCornerShape(20.dp),
                    color = MaterialTheme.colorScheme.surfaceContainer,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                ) {
                    Column(Modifier.verticalScroll(rememberScrollState()).padding(8.dp)) {
                        services.forEach { service ->
                            val active = chrome.service?.webPath == service.path
                            Surface(
                                onClick = {
                                    expanded = false
                                    chrome.onService(service.path)
                                },
                                color = if (active) MaterialTheme.colorScheme.secondaryContainer
                                    else MaterialTheme.colorScheme.surfaceContainer,
                                shape = RoundedCornerShape(12.dp),
                            ) {
                                Row(
                                    Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 16.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                                ) {
                                    if (service == wishlistService) {
                                        Icon(painterResource(R.drawable.wishlist_gift), null, Modifier.size(24.dp))
                                    }
                                    Text(service.label, style = MaterialTheme.typography.bodyLarge)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private class DockPopupPosition(private val above: Boolean, private val gap: Int) : PopupPositionProvider {
    override fun calculatePosition(
        anchorBounds: IntRect,
        windowSize: IntSize,
        layoutDirection: LayoutDirection,
        popupContentSize: IntSize,
    ): IntOffset {
        val x = if (layoutDirection == LayoutDirection.Ltr) anchorBounds.left
            else anchorBounds.right - popupContentSize.width
        val y = if (above) anchorBounds.top - popupContentSize.height - gap else anchorBounds.bottom + gap
        return IntOffset(
            x.coerceIn(0, (windowSize.width - popupContentSize.width).coerceAtLeast(0)),
            y.coerceIn(0, (windowSize.height - popupContentSize.height).coerceAtLeast(0)),
        )
    }
}

@Composable
private fun SpaceSelector(space: WishSpace, onSpace: (WishSpace) -> Unit, modifier: Modifier, docked: Boolean) {
    var expanded by remember { mutableStateOf(false) }
    Box(modifier) {
        OutlinedButton(
            onClick = { expanded = true },
            modifier = Modifier.fillMaxWidth().heightIn(min = ControlSize)
                .semantics { contentDescription = "Раздел сервиса Вишлист" },
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainer,
                contentColor = MaterialTheme.colorScheme.onSurface,
            ),
        ) {
            Icon(painterResource(R.drawable.wishlist_bag), null, Modifier.size(ControlIconSize))
            Text(
                space.label,
                Modifier.weight(1f).padding(horizontal = ControlGap),
                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Icon(Icons.Default.KeyboardArrowDown, null, Modifier.size(ControlIconSize))
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            offset = DpOffset(0.dp, if (docked) (-8).dp else 8.dp),
        ) {
            WishSpace.entries.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option.label, style = MaterialTheme.typography.bodyLarge) },
                    onClick = { expanded = false; if (space != option) onSpace(option) },
                    trailingIcon = if (option == space) {
                        { Icon(Icons.Default.Check, null, Modifier.size(ControlIconSize)) }
                    } else null,
                )
            }
        }
    }
}
