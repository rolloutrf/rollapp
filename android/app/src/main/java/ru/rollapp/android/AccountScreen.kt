package ru.rollapp.android

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
internal fun SignInScreen(
    state: LoginState,
    startLogin: () -> Unit,
    retry: () -> Unit,
    layout: CollectionLayout,
) {
    BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        val availableHeight = maxHeight
        Column(
            Modifier.padding(horizontal = layout.inset).widthIn(max = 448.dp).fillMaxWidth()
                .verticalScroll(rememberScrollState()).heightIn(min = availableHeight)
                .padding(top = PageGap, bottom = if (layout.mobile) 0.dp else 64.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(PageGap, Alignment.CenterVertically),
        ) {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Eyebrow("С ВОЗВРАЩЕНИЕМ")
                    Text(
                        "Войти в Rollapp",
                        style = MaterialTheme.typography.displaySmall.copy(letterSpacing = (-1.5).sp),
                        modifier = Modifier.semantics { heading() },
                    )
                }
                Text(
                    "Войдите с Яндекс ID, подключённым к вашему аккаунту Rollapp.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (state is LoginState.Error) {
                Column(
                    Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
                    verticalArrangement = Arrangement.spacedBy(ControlGap),
                ) {
                    Text(state.message, color = MaterialTheme.colorScheme.error)
                    OutlinedButton(onClick = retry, modifier = Modifier.heightIn(min = ControlSize)) {
                        Text("Проверить сессию")
                    }
                }
            }
            Button(
                onClick = startLogin,
                enabled = state != LoginState.Working,
                modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color.Black),
                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp),
            ) {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    if (state == LoginState.Working) {
                        CircularProgressIndicator(Modifier.align(Alignment.CenterStart).size(24.dp), strokeWidth = 2.dp)
                    } else {
                        Image(painterResource(R.drawable.yandex_id), null, Modifier.align(Alignment.CenterStart).size(40.dp))
                    }
                    Text(
                        "Войти с Яндекс ID",
                        modifier = Modifier.padding(horizontal = 44.dp),
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                        textAlign = TextAlign.Center,
                    )
                }
            }
            Text(
                "Регистрация по приглашению.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
internal fun AccountScreen(
    credential: NativeCredential,
    signOut: (NativeCredential) -> Unit,
    onBack: () -> Unit,
    layout: CollectionLayout,
    onSaved: () -> Unit,
) {
    var revision by androidx.compose.runtime.remember { androidx.compose.runtime.mutableIntStateOf(0) }
    val data by nativeData("/api/me", credential, revision)
    val operation = rememberNativeMutation()
    val profile = (data as? NativeData.Ready)?.value?.optJSONObject("user")
    val profileId = profile?.cleanString("id")
    var name by androidx.compose.runtime.saveable.rememberSaveable(profileId) {
        androidx.compose.runtime.mutableStateOf(profile?.cleanString("name").orEmpty())
    }
    var bio by androidx.compose.runtime.saveable.rememberSaveable(profileId) {
        androidx.compose.runtime.mutableStateOf(profile?.cleanString("bio").orEmpty())
    }
    val dirty = name.trim() != profile?.cleanString("name") || bio.trim() != profile.cleanBio()
    val canSave = profileId == credential.user.id && name.trim().length >= 2 && dirty && !operation.busy
    val goBack = { if (!operation.busy) onBack() }
    androidx.activity.compose.BackHandler(onBack = goBack)
    NativePage(layout, maxWidth = 576.dp, footer = {
        NativeFooter(goBack, "Сохранить", canSave, {
            operation.run {
                val payload = org.json.JSONObject().put("name", name.trim()).put("bio", bio.trim())
                val saved = credential.request("/api/me", payload, "PATCH").getJSONObject("user")
                check(saved.cleanString("id") == credential.user.id)
                onSaved()
            }
        })
    }) {
        NativeTitle("Профиль")
        DataContent(data, { revision++ }) {
            if (profileId != credential.user.id) {
                NativeMessage("Не удалось подтвердить аккаунт. Проверьте вход.", error = true)
            } else {
                ProfileIdentity(credential.user.name, credential.user.avatarUrl)
                FormField(name, { name = it }, "Имя", 80, enabled = !operation.busy)
                FormField(bio, { bio = it }, "О себе", 300, lines = 3, enabled = !operation.busy)
                OutlinedButton(
                    onClick = { signOut(credential) }, enabled = !operation.busy,
                    modifier = Modifier.heightIn(min = ControlSize),
                ) { Text("Выйти") }
            }
        }
        operation.error?.let { NativeMessage(it, error = true) }
    }
}

private fun org.json.JSONObject?.cleanBio() = this?.cleanString("bio").orEmpty()
