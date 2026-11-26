package ru.rollapp.android

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

@OptIn(ExperimentalTextApi::class)
private val Geist = FontFamily(
    Font(R.font.geist_variable, weight = FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
    Font(R.font.geist_variable, weight = FontWeight.SemiBold, variationSettings = FontVariation.Settings(FontVariation.weight(600))),
    Font(R.font.geist_variable, weight = FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.weight(700))),
)

private fun type(size: Int, leading: Int, weight: FontWeight = FontWeight.Normal) =
    TextStyle(fontFamily = Geist, fontWeight = weight, fontSize = size.sp, lineHeight = leading.sp, letterSpacing = 0.sp)

private val rollappTypography = Typography(
    displaySmall = type(36, 40, FontWeight.Bold),
    headlineLarge = type(30, 36, FontWeight.Bold),
    headlineMedium = type(24, 32, FontWeight.SemiBold),
    titleLarge = type(20, 28, FontWeight.SemiBold),
    titleMedium = type(18, 28, FontWeight.SemiBold),
    titleSmall = type(16, 24, FontWeight.SemiBold),
    bodyLarge = type(18, 28),
    bodyMedium = type(18, 28),
    bodySmall = type(13, 16),
    labelLarge = type(18, 28, FontWeight.SemiBold),
    labelMedium = type(13, 16, FontWeight.SemiBold),
    labelSmall = type(13, 16, FontWeight.SemiBold),
)

private val dark = darkColorScheme(
    primary = Color(0xFFF5F5F5),
    onPrimary = Color(0xFF171717),
    primaryContainer = Color(0xFF262626),
    onPrimaryContainer = Color(0xFFFAFAFA),
    secondaryContainer = Color(0xFF262626),
    onSecondaryContainer = Color(0xFFFAFAFA),
    background = Color(0xFF0C0C0C),
    onBackground = Color(0xFFFAFAFA),
    surface = Color(0xFF0C0C0C),
    onSurface = Color(0xFFFAFAFA),
    surfaceContainer = Color(0xFF171717),
    surfaceContainerHigh = Color(0xFF262626),
    onSurfaceVariant = Color(0xFFA3A3A3),
    outline = Color(0xFF737373),
    outlineVariant = Color(0xFF3A3A3A),
)

private val light = lightColorScheme(
    primary = Color(0xFF171717),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE5E5E5),
    onPrimaryContainer = Color(0xFF171717),
    secondaryContainer = Color(0xFFE5E5E5),
    onSecondaryContainer = Color(0xFF171717),
    background = Color.White,
    onBackground = Color(0xFF171717),
    surface = Color.White,
    onSurface = Color(0xFF171717),
    surfaceContainer = Color(0xFFF5F5F5),
    surfaceContainerHigh = Color(0xFFE5E5E5),
    onSurfaceVariant = Color(0xFF525252),
    outline = Color(0xFF737373),
    outlineVariant = Color(0xFFD4D4D4),
)

@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
internal fun RollappTheme(content: @Composable () -> Unit) {
    MaterialExpressiveTheme(
        colorScheme = if (isSystemInDarkTheme()) dark else light,
        motionScheme = MotionScheme.expressive(),
        typography = rollappTypography,
        content = content,
    )
}
