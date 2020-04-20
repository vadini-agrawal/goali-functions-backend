
const functions = require('firebase-functions');
const app = require('express')();
const FBAuth = require('./util/fbAuth');

const { db } = require('./util/admin');

const { getAllUpdates, postOneUpdate, getUpdate, commentOnUpdate, deleteUpdate, likeUpdate, unlikeUpdate} = require('./handlers/updates');
const {signup, login, uploadImage, addUserDetails, getAuthenticatedUser, getUserDetails, markNotificationsRead} = require('./handlers/users');

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
// const firebase = require('firebase');
// firebase.initializeApp(firebaseConfig);

//Update routes 
app.get('/updates', getAllUpdates);
app.post('/update', FBAuth, postOneUpdate);
app.get('/update/:updateId', getUpdate);
app.delete('/update/:updateId', FBAuth, deleteUpdate);
app.get('/update/:updateId/like', FBAuth, likeUpdate);
app.get('/update/:updateId/unlike', FBAuth, unlikeUpdate);
app.post('/update/:updateId/comment', FBAuth, commentOnUpdate);

//Users route
app.post('/signup', signup);
app.post('/login', login);
app.post('/user/image', FBAuth, uploadImage);
app.post('/user', FBAuth, addUserDetails);
app.get('/user', FBAuth, getAuthenticatedUser);
app.get('/user/:handle', getUserDetails);
app.post('/notifications', FBAuth, markNotificationsRead);

//express will help us manage the Request type in a more streamlined way 


exports.api = functions.https.onRequest(app);

exports.createNotificationOnLike = functions.firestore.document(`likes/{id}`)
    .onCreate((snapshot) => {
        return db.doc(`/updates/${snapshot.data().updateId}`).get()
        .then(doc => {
            if (doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
                return db.doc(`/notifications/${snapshot.id}`).set({
                    createdAt: new Date().toISOString(),
                    recipient: doc.data().userHandle,
                    sender: snapshot.data().userHandle,
                    type: 'like',
                    read: false, 
                    updateId: doc.id
                });
            }
        })
        .catch(err => {
            console.error(err);
        })
    });

exports.deleteNotificationOnUnlike = functions.firestore.document('/likes/{id}')
    .onDelete((snapshot) => {
       return db.doc(`/notifications/${snapshot.id}`)
        .delete()
        .catch(err => {
            console.error(err);
        })
    });

exports.createNotificationOnComment = functions.firestore.document('/comments/{id}')
    .onCreate((snapshot) => {
        return db.doc(`/updates/${snapshot.data().updateId}`).get()
        .then(doc => {
            if (doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
                return db.doc(`/notifications/${snapshot.id}`).set({
                    createdAt: new Date().toISOString(),
                    recipient: doc.data().userHandle,
                    sender: snapshot.data().userHandle,
                    type: 'comment',
                    read: false, 
                    updateId: doc.id
                });
            }
        })
        .catch(err => {
            console.error(err);
        })
    });

exports.onUserImageChange = functions.firestore.document('/users/{userId}')
    .onUpdate((change) => {
        console.log(change.before.data());
        console.log(change.after.data());
        if (change.before.data().imageUrl !== change.after.data().imageUrl) {
            console.log('image has changed.');
            let batch = db.batch();
            return db.collection('updates').where('userHandle', '==', change.before.data().handle).get()
                .then((data) => {
                    data.forEach(doc => {
                        const update = db.doc(`/updates/${doc.id}`);
                        batch.update(update, { userImage: change.after.data().imageUrl});
                    })
                    return batch.commit();
                })
        } else return true;
    });

exports.onUpdateDelete = functions.firestore.document('/updates/{updateId}')
    .onDelete((snapshot, context) => {
        const updateId = context.params.updateId;
        const batch = db.batch();
        return db.collection('comments').where('updateId', '==', updateId).get()
            .then(data => {
                data.forEach(doc => {
                    batch.delete(db.doc(`/comments/${doc.id}`));
                });
                return db.collection('likes').where('updateId', '==', updateId).get();
            })
            .then(data => {
                data.forEach(doc => {
                    batch.delete(db.doc(`/likes/${doc.id}`));
                });
                return db.collection('notifications').where('updateId', '==', updateId).get();
            })
            .then(data => {
                data.forEach(doc => {
                    batch.delete(db.doc(`/notifications/${doc.id}`));
                });
                return batch.commit();
            })
            .catch(err => {
                console.error(err);
            })
    });