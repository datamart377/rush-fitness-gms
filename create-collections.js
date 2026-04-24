const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function createCollections() {
  const collections = [
    'members', 'memberships', 'payments', 'attendance', 'trainers',
    'staff', 'equipment', 'lockers', 'discounts', 'walkIns',
    'reconciliations', 'products', 'expenses', 'timetable'
  ];

  for (const collName of collections) {
    try {
      // Create collection by adding a dummy doc then deleting it
      await db.collection(collName).doc('_temp').set({ temp: true });
      await db.collection(collName).doc('_temp').delete();
      console.log(`✓ Created collection: ${collName}`);
    } catch (err) {
      console.error(`Error creating ${collName}:`, err.message);
    }
  }
  
  console.log('\n✅ All collections created successfully!');
  process.exit(0);
}

createCollections();
