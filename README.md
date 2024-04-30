# L'API REST de l'application

## Installation et démarrage du serveur

Pour démarrer le serveur, vous devez exécuter les commandes suivantes à la racine du dossier `backend`:

```bash
npm install
npm start
```

Une fois le serveur démarré, vous pouvez accéder à l'application à l'adresse `http://localhost:3000`.

## Exemples de requêtes HTTP

Des exemples de requêtes HTTP sont disponibles dans le dossier `backend/requests`. Il est possible d'exécuter ces requêtes directement dans VSCode en utilisant [l'extension REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)

Des variables sont utilisées dans les requêtes HTTP. Ces variables sont définies dans le fichier `backend/.vscode/settings.json`. Vous devez modifier ce fichier pour, par exemple, utiliser le bon jeton d'authentification.

IMPORTANT: Pour exécuter les requêtes HTTP, il faut que le dossier `backend` soit ouvert dans VSCode (et non le dossier parent).

## Les données dans la base de données

Le dossier `backend/data` contient deux fichiers :

- `db-clear.json` : Un fichier qui ne contient aucune donnée.
- `db-seed.json` : Des données qui peuvent être utilisées pour peupler la base de données.

À chaque démarrage du serveur, la base de données est réinitialisée avec le contenu du fichier `backend/data/db-seed.json`.

Des routes, voir le fichier `backend/requests/db.http`, sont disponibles pour :

- Effacer toutes les données de la base de données.
- Peupler la BD avec `backend/data/db-seed.json`.
