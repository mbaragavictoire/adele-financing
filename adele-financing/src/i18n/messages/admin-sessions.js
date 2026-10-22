// Strings for the admin Sessions page (src/pages/admin/Sessions.jsx).
// Role identifiers are shown raw (formatted from the API value), and the
// "Inactive" badge reuses the shared `status.inactive` key.
export default {
  en: {
    'sessions.refresh': 'Refresh',
    'sessions.activeHeading': 'Currently signed in ({count})',
    'sessions.policy':
      'Idle timeout {idle} min · maximum {absolute} h · up to {max} simultaneous sessions per account',
    'sessions.emptyActive': 'Nobody is currently signed in.',
    'sessions.staffMember': 'Staff member',
    'sessions.role': 'Role',
    'sessions.device': 'Device',
    'sessions.ipAddress': 'IP address',
    'sessions.signedIn': 'Signed in',
    'sessions.lastActivity': 'Last activity',
    'sessions.suspended': 'Suspended',
    'sessions.unknownIp': 'unknown',
    'sessions.closing': 'Closing…',
    'sessions.revoke': 'Revoke',
    'sessions.closeAllForAccount': 'Close all for this account',
    'sessions.recentlyClosed': 'Recently closed',
    'sessions.emptyClosed': 'No sessions have been closed yet.',
    'sessions.closed': 'Closed',
    'sessions.reason': 'Reason',
    'sessions.confirmRevokeOthers':
      'Close every other active session for {name}?\n\nYour own session on this device stays signed in.',
    'sessions.confirmRevokeAll':
      'Close every active session for {name}?\n\nThis includes your own session, so you will be asked to sign in again.',
  },
  rw: {
    'sessions.refresh': 'Subiramo',
    'sessions.activeHeading': 'Abakwinjira ubu ({count})',
    'sessions.policy':
      'Igihe cy\'iteganyirijwe {idle} iminota · ntarengwa {absolute} amasaha · kugeza ku {max} uburyo bwo kwinjira mu gihe kimwe kuri konti imwe',
    'sessions.emptyActive': 'Nta wubu arinjira.',
    'sessions.staffMember': 'Umukozi',
    'sessions.role': 'Inyoboshinga',
    'sessions.device': 'Igikoresho',
    'sessions.ipAddress': 'Aderesi ya IP',
    'sessions.signedIn': 'Yinjiye',
    'sessions.lastActivity': 'Ibikorwa bya nyuma',
    'sessions.suspended': 'Yahagaritswe',
    'sessions.unknownIp': 'ntibumwe',
    'sessions.closing': 'Birafungwa…',
    'sessions.revoke': 'Kuraho',
    'sessions.closeAllForAccount': 'Funga byose kuri iyi konti',
    'sessions.recentlyClosed': 'Byafunguye vuba',
    'sessions.emptyClosed': 'Nta buryo bwo kwinjira bufunye ubu.',
    'sessions.closed': 'Byafunguye',
    'sessions.reason': 'Impamvu',
    'sessions.confirmRevokeOthers':
      'Funga uburyo bwose bwo kwinjira bw\'inyine bufitanye {name}?\n\nUburyo bwawe bwo kwinjira kuri iyi mashini buzamara gusigara bwemewe.',
    'sessions.confirmRevokeAll':
      'Funga uburyo bwose bwo kwinjira bufitanye {name}?\n\nIbyo birimo n\'uburyo bwawe bwo kwinjira, kuko uzasabwa kongera kwinjira.',
  },
  fr: {
    'sessions.refresh': 'Actualiser',
    'sessions.activeHeading': 'Connectés actuellement ({count})',
    'sessions.policy':
      "Délai d'inactivité {idle} min · maximum {absolute} h · jusqu'à {max} sessions simultanées par compte",
    'sessions.emptyActive': "Personne n'est connecté actuellement.",
    'sessions.staffMember': 'Membre du personnel',
    'sessions.role': 'Rôle',
    'sessions.device': 'Appareil',
    'sessions.ipAddress': 'Adresse IP',
    'sessions.signedIn': 'Connecté le',
    'sessions.lastActivity': 'Dernière activité',
    'sessions.suspended': 'Suspendu',
    'sessions.unknownIp': 'inconnu',
    'sessions.closing': 'Fermeture…',
    'sessions.revoke': 'Révoquer',
    'sessions.closeAllForAccount': 'Tout fermer pour ce compte',
    'sessions.recentlyClosed': 'Récemment fermées',
    'sessions.emptyClosed': "Aucune session n'a encore été fermée.",
    'sessions.closed': 'Fermée',
    'sessions.reason': 'Motif',
    'sessions.confirmRevokeOthers':
      'Fermer toutes les autres sessions actives de {name} ?\n\nVotre session sur cet appareil restera connectée.',
    'sessions.confirmRevokeAll':
      'Fermer toutes les sessions actives de {name} ?\n\nCela inclut votre propre session : vous devrez vous reconnecter.',
  },
}
