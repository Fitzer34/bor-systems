package com.borsystems.app.ui.business

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.FormTpl
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Forms fill-in on the phone (the builder stays on the web, same as iPhone).
 * Answers post as mixed types — checkboxes as booleans, numbers as numbers,
 * everything else as strings — matching what the web builder expects.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FormsScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var forms by remember { mutableStateOf<List<FormTpl>?>(null) }
    var failed by remember { mutableStateOf(false) }
    var filling by remember { mutableStateOf<FormTpl?>(null) }
    var doneToast by remember { mutableStateOf(false) }

    suspend fun load() {
        try { forms = ApiClient.forms().filter { it.active }; failed = false }
        catch (_: Exception) { if (forms == null) failed = true }
    }
    LaunchedEffect(Unit) { load() }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Forms") },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
        )
    }) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            val list = forms
            when {
                failed -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Could not load forms.")
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { scope.launch { load() } }) { Text("Retry") }
                }
                list == null -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                list.isEmpty() -> Text(
                    "No forms yet. Build them on the web under Forms — they appear here to fill in.",
                    modifier = Modifier.align(Alignment.Center).padding(16.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                else -> LazyColumn(contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(list, key = { it.id }) { f ->
                        Card(onClick = { filling = f }, modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(f.name, style = MaterialTheme.typography.titleSmall)
                                Text(
                                    listOfNotNull(f.description, "${f.fields.size} questions").joinToString(" · "),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
            if (doneToast) {
                Snackbar(Modifier.align(Alignment.BottomCenter).padding(12.dp)) { Text("Thanks — your answers are recorded.") }
                LaunchedEffect(Unit) { kotlinx.coroutines.delay(2500); doneToast = false }
            }
        }
    }

    filling?.let { f ->
        FillFormSheet(form = f, onDismiss = { filling = null },
            onSubmitted = { filling = null; doneToast = true; scope.launch { load() } })
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FillFormSheet(form: FormTpl, onDismiss: () -> Unit, onSubmitted: () -> Unit) {
    val scope = rememberCoroutineScope()
    val texts = remember { mutableStateMapOf<String, String>() }
    val bools = remember { mutableStateMapOf<String, Boolean>() }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val requiredFilled = form.fields.all { f ->
        f.required != true || f.type == "checkbox" || !texts[f.id].isNullOrBlank()
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { Text(form.name, style = MaterialTheme.typography.titleMedium) }
            form.description?.let { d ->
                item { Text(d, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            items(form.fields.size) { idx ->
                val f = form.fields[idx]
                when (f.type) {
                    "checkbox" -> Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = bools[f.id] ?: false, onCheckedChange = { bools[f.id] = it })
                        Text(f.label)
                    }
                    "select" -> Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(f.label, style = MaterialTheme.typography.labelMedium)
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                            (f.options ?: emptyList()).take(4).forEach { o ->
                                FilterChip(selected = texts[f.id] == o, onClick = { texts[f.id] = o },
                                    label = { Text(o, maxLines = 1) })
                            }
                        }
                    }
                    else -> OutlinedTextField(
                        value = texts[f.id] ?: "",
                        onValueChange = { texts[f.id] = it },
                        label = { Text(f.label + if (f.required == true) " *" else "") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = if (f.type == "textarea") 2 else 1,
                        placeholder = { if (f.type == "date") Text("YYYY-MM-DD") else if (f.type == "number") Text("0") },
                    )
                }
            }
            item {
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                Button(
                    onClick = {
                        sending = true
                        scope.launch {
                            try {
                                val answers: JsonObject = buildJsonObject {
                                    form.fields.forEach { f ->
                                        when (f.type) {
                                            "checkbox" -> put(f.id, bools[f.id] ?: false)
                                            "number" -> texts[f.id]?.toDoubleOrNull()?.let { put(f.id, it) }
                                            else -> texts[f.id]?.takeIf { it.isNotBlank() }?.let { put(f.id, it) }
                                        }
                                    }
                                }
                                val body = buildJsonObject { put("answers", answers) }
                                ApiClient.submitForm(form.id, body.toString())
                                onSubmitted()
                            } catch (_: Exception) {
                                error = "Couldn't submit. Check your connection and try again."
                            } finally { sending = false }
                        }
                    },
                    enabled = requiredFilled && !sending,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (sending) "Submitting…" else "Submit") }
                Spacer(Modifier.height(12.dp))
            }
        }
    }
}
