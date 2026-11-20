import { createId, normalizeCharacter, validateCharacter } from '../models/character.js';

export const EXPORT_FORMAT = 'warhammer-character-manager';
export const EXPORT_VERSION = 1;
export const MAX_IMPORT_SIZE = 10 * 1024 * 1024;

export function createCharacterExport(character, exportedAt = new Date().toISOString()) {
  return {
    app: EXPORT_FORMAT,
    type: 'character',
    version: EXPORT_VERSION,
    exportedAt,
    character
  };
}

export function createBackupExport(characters, exportedAt = new Date().toISOString()) {
  return {
    app: EXPORT_FORMAT,
    type: 'backup',
    version: EXPORT_VERSION,
    exportedAt,
    characters
  };
}

export function parseImportPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Le fichier doit contenir un objet JSON.');
  }
  if (payload.app !== EXPORT_FORMAT) throw new Error('Ce fichier ne provient pas de Warhammer Character Manager.');
  if (payload.version !== EXPORT_VERSION) throw new Error(`Version de sauvegarde non prise en charge : ${payload.version ?? 'inconnue'}.`);

  const characters = payload.type === 'character'
    ? [payload.character]
    : payload.type === 'backup'
      ? payload.characters
      : null;

  if (!Array.isArray(characters) || characters.length > 1000) {
    throw new Error('Le contenu du fichier est invalide ou contient trop de personnages.');
  }
  if (characters.length === 0) throw new Error('Cette sauvegarde ne contient aucun personnage.');

  const invalid = characters.flatMap((character, index) => {
    const result = validateCharacter(character);
    return result.valid ? [] : result.errors.map((message) => `Personnage ${index + 1} : ${message}`);
  });
  if (invalid.length) throw new Error(invalid.slice(0, 5).join('\n'));

  return { type: payload.type, characters };
}

export function prepareImportedCharacters(characters, existingIds = new Set()) {
  const usedIds = new Set(existingIds);
  return characters.map((character) => {
    const imported = normalizeCharacter(character);
    const hadCollision = usedIds.has(imported.id);
    if (hadCollision) imported.id = createId();
    usedIds.add(imported.id);
    imported.isDraft = false;
    return { character: imported, copiedBecauseOfIdCollision: hadCollision };
  });
}
