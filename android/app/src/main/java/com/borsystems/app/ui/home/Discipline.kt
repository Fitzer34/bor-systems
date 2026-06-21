package com.borsystems.app.ui.home

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * Discipline — Android mirror of the web `lib/section.tsx` "section" split.
 *
 * HazardLink is one login but the app is divided into discipline sides:
 *   cleaning    — IoT spill-safety (alerts, dispatch, schedules, sensors)
 *   maintenance — CMMS / FM (jobs, assets, meters, PPMs, KPIs)
 *   security    — patrols, incidents, checkpoints
 *
 * Admin/supervisor pick one (and can switch). Field cleaners are always pinned
 * to the cleaning side. The choice is persisted in DataStore so it survives
 * relaunch — same role localStorage plays on the web.
 */
enum class Discipline(val id: String, val label: String) {
    Cleaning("cleaning", "Cleaning"),
    Maintenance("maintenance", "Maintenance"),
    Security("security", "Security");

    companion object {
        fun fromId(id: String?): Discipline? = entries.firstOrNull { it.id == id }
    }
}

/**
 * DataStore-backed store for the chosen discipline. A single app-wide instance
 * (the `Context.disciplineDataStore` extension guarantees one per process).
 */
object DisciplineStore {
    private val KEY = stringPreferencesKey("discipline")

    /** Emits the persisted discipline, or null when the user hasn't chosen yet. */
    fun flow(context: Context): Flow<Discipline?> =
        context.disciplineDataStore.data.map { prefs -> Discipline.fromId(prefs[KEY]) }

    suspend fun set(context: Context, discipline: Discipline) {
        context.disciplineDataStore.edit { it[KEY] = discipline.id }
    }
}

private val Context.disciplineDataStore by preferencesDataStore(name = "discipline_prefs")
