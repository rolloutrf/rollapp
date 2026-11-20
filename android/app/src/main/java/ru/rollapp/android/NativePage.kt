package ru.rollapp.android

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.json.JSONObject

internal sealed interface NativeData {
    data object Loading : NativeData
    data class Ready(val value: JSONObject) : NativeData
    data class Failed(val message: String) : NativeData
}

@Composable
internal fun nativeData(path: String, credential: NativeCredential?, revision: Int = 0): State<NativeData> {
    val result = remember(path, credential, revision) { mutableStateOf<NativeData>(NativeData.Loading) }
    LaunchedEffect(path, credential, revision) {
        result.value = try {
            NativeData.Ready(if (credential == null) requestNativeJson(path).json else credential.request(path))
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            NativeData.Failed(error.nativeMessage("Не удалось загрузить раздел."))
        }
    }
    return result
}

internal fun Throwable.nativeMessage(fallback: String): String =
    (this as? NativeHttpError)?.message?.takeIf(String::isNotBlank) ?: fallback

internal fun JSONObject.rows(key: String): List<JSONObject> {
    val array = optJSONArray(key) ?: return emptyList()
    return (0 until array.length()).mapNotNull(array::optJSONObject)
}

internal class NativeMutation(private val scope: CoroutineScope) {
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    fun clear() { if (!busy) error = null }

    fun run(operation: suspend () -> Unit) {
        if (busy) return
        busy = true
        error = null
        scope.launch {
            try {
                operation()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                error = failure.nativeMessage("Сервер не подтвердил действие. Обновите данные перед повтором.")
            } finally {
                busy = false
            }
        }
    }
}

@Composable
internal fun rememberNativeMutation(): NativeMutation {
    val scope = rememberCoroutineScope()
    return remember(scope) { NativeMutation(scope) }
}

@Composable
internal fun NativePage(
    layout: CollectionLayout,
    modifier: Modifier = Modifier,
    maxWidth: Dp = 768.dp,
    topPadding: Dp = PageGap,
    footer: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        Column(Modifier.widthIn(max = maxWidth).fillMaxSize().padding(horizontal = layout.inset)) {
            Column(
                Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(top = topPadding, bottom = PageGap),
                verticalArrangement = Arrangement.spacedBy(PageGap),
                content = content,
            )
            if (footer != null) Box(Modifier.fillMaxWidth().padding(bottom = 16.dp)) { footer() }
        }
    }
}

@Composable
internal fun NativeTitle(title: String) {
    Text(title, style = MaterialTheme.typography.headlineLarge, modifier = Modifier.semantics { heading() })
}

@Composable
internal fun NativeMessage(message: String, error: Boolean = false) {
    Text(
        message,
        color = if (error) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
    )
}

@Composable
internal fun DataContent(data: NativeData, retry: () -> Unit, content: @Composable (JSONObject) -> Unit) {
    when (data) {
        NativeData.Loading -> CircularProgressIndicator()
        is NativeData.Failed -> Column(verticalArrangement = Arrangement.spacedBy(ControlGap)) {
            NativeMessage(data.message, error = true)
            OutlinedButton(onClick = retry, modifier = Modifier.heightIn(min = ControlSize)) { Text("Повторить") }
        }
        is NativeData.Ready -> content(data.value)
    }
}

@Composable
internal fun NativeFooter(
    onBack: () -> Unit,
    label: String,
    enabled: Boolean,
    onAction: () -> Unit,
    destructive: Boolean = false,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ControlGap)) {
        ChromeIconButton(Icons.AutoMirrored.Filled.ArrowBack, "Назад", onBack)
        Button(
            onClick = onAction,
            enabled = enabled,
            colors = if (destructive) ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.error,
                contentColor = MaterialTheme.colorScheme.onError,
            ) else ButtonDefaults.buttonColors(),
            modifier = Modifier.weight(1f).heightIn(min = ControlSize),
        ) { Text(label) }
    }
}
