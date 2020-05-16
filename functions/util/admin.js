var serviceAccount = require('../serviceAccountKey.json');

var admin = require('firebase-admin');
const app = require('express')();

const config = require('../util/config');

// const firebase = require('firebase');
// firebase.initializeApp(config);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL:  "https://goali-94346.firebaseio.com",
    storageBucket: "goali-94346.appspot.com"
});

const db = admin.firestore();


module.exports = { admin, db};