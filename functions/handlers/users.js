const { admin, db  } = require('../util/admin');

// var serviceAccount = require('../serviceAccountKey.json');

// var admin = require('firebase-admin');
// const app = require('express')();

const config = require('../util/config');

const firebase = require('firebase');
firebase.initializeApp(config);
// firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);

exports.firebase = () => {
    return firebase;
}
// admin.initializeApp({
//     credential: admin.credential.cert(serviceAccount),
//     databaseURL:  "https://goali-94346.firebaseio.com"
// });

// const db = admin.firestore();

//const config = require('../util/config');

// const firebase = require('firebase');
// firebase.initializeApp(config);

const { validateSignupData, validateLoginData, reduceUserDetails } = require('../util/validators');

exports.signup = (req, res) => {
    const newUser = {
        email: req.body.email,
        password: req.body.password,
        confirmPassword: req.body.confirmPassword,
        handle: req.body.handle
    };

    const { errors, valid } = validateSignupData(newUser);

    if (!valid) return res.status(400).json(errors);

    const noImg = 'no-img.png';

    let token, userId;
    db.doc(`/users/${newUser.handle}`).get()
        .then(doc => {
            if(doc.exists) {
                return res.status(400).json({ handle: ' This handle is taken.'});
            } else {
                return firebase.auth() //replaced 
                .createUserWithEmailAndPassword(newUser.email, newUser.password);
            }
        })
        .then((data) => {
            userId = data.user.uid;
            return data.user.getIdToken();
        })
        .then((idToken) => {
            token = idToken;
            const userCredentials = {
                handle: newUser.handle,
                email: newUser.email, 
                createdAt: new Date().toISOString(),
                imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
                userId
            };
            return db.doc(`/users/${newUser.handle}`).set(userCredentials);
            //return res.status(201).json({ token })
        }) 
        .then(() => {
            // window.location.assign('/');
            return res.status(201).json({ token });
        })
        .catch(err => {
            console.error(err);
            if(err.code === 'auth/email-already-in-use') {
                return res.status(400).json({ email: 'Email is already in use.'});
            } else {
                return res.status(500).json({ general: 'Something went wrong, please try again. '});
            }
        })
};

// log user in 
exports.login = (req, res) => {
    const user = {
        email: req.body.email,
        password: req.body.password
    };

    const { errors, valid } = validateLoginData(user);
    
    console.log(valid);

    if (!valid) return res.status(400).json(errors);

    firebase.auth().signInWithEmailAndPassword(user.email, user.password) //replaced
    .then(data => {
        return data.user.getIdToken();
    })
    .then(token => {
        // window.location.assign('/');
        return res.status(201).json({ token });
    })
    .catch(err => {
        console.log(err);
        // auth/wrong-password
        // auth/user-not-user 
        return res.status(403).json({ general: 'Wrong credentials, please try again.'});
    });
};

// Add user details 
exports.addUserDetails = (req, res) => {
    let userDetails = reduceUserDetails(req.body);
    db.doc(`/users/${req.user.handle}`).update(userDetails)
    .then(() => {
        return res.json({ message: 'Details added successfully'});
    })
    .catch(err => {
        console.error(err);
        return res.status(500).json({error: err.code});
    });
}   

exports.getUserDetails = (req, res) => {
    let userData = {};
    // userData.token = req.params.token;
    db.doc(`/users/${req.params.handle}`).get()
        .then(doc => {
            if (doc.exists) {
                userData.user = doc.data();
                return db.collection('updates').where('userHandle', '==', req.params.handle)
                    .orderBy('createdAt', 'desc')
                    .get();
            } else {
                return res.status(404).json({ errors: 'User not found. '});
            }
        })
        .then(data => {
            userData.updates = [];
            data.forEach(doc => {
                userData.updates.push({
                    body: doc.data().body,
                    userHandle: doc.data().userHandle,
                    userImage: doc.data().userImage,
                    likeCount: doc.data().likeCount,
                    commentCount: doc.data().commentCount,
                    goalType: doc.data().goalType,
                    updateId: doc.id
                })
            });
            return res.json(userData);
        })
        .catch(err => {
            console.error(err);
            return res.status(500).json({error: err.code});
        })
    
}

exports.getNewToken = (data) => {
    // if (firebase.auth().currentUser != null) {
    //     firebase.auth().currentUser.getIdToken(true)
    //     .then((idToken) => {
    //         return res.status(201).json({ idToken });
    //     }).catch(err =>  {
    //         return res.status(500).json({ err });
    //     });
    // } else {
    //     console.log('Something went wrong with the current user.');
    // }
    // let newToken;
    firebase.auth().token.getIdToken(true)
        .then((token) => {
            return token;
        })
        .catch(err => {
            console.log(err);
        })
}

// Get own user details
exports.getAuthenticatedUser = (req, res) => {
    let userData = {};

    db.doc(`/users/${req.user.handle}`).get()
        .then(doc => {
            if (doc.exists) {
                userData.credentials = doc.data();
                return db.collection('likes').where('userHandle', '==', req.user.handle).get();
            } 
        })
        .then(data => {
            userData.likes = [];
            data.forEach(doc => {
                userData.likes.push(doc.data());
            });
            return db.collection('notifications').where('recipient', '==', req.user.handle)
                .orderBy('createdAt', 'desc').limit(10).get();
        })
        .then(data => {
            userData.notifications = [];
            data.forEach(doc => {
                userData.notifications.push({
                    recipient: doc.data().recipient,
                    sender: doc.data().sender,
                    createdAt: doc.data().createdAt,
                    updateId: doc.data().updateId,
                    type: doc.data().type,
                    read: doc.data().read,
                    notificationId: doc.id,
                });
            });
            return res.json(userData);
        })
        .catch(err => {
            console.error(err);
            return res.status(500).json({ error: err.code});
        });
}

// Upload profile image
exports.uploadImage = (req, res) => {
    const BusBoy = require('busboy');
    const path = require('path');
    const os = require('os');
    const fs = require('fs');

    const busboy = new BusBoy({ headers: req.headers });
    
    let imageFileName;
    let imageToBeUploaded = {};

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        // image.png
        if (mimetype !== 'image/jpeg' && mimetype !== 'image/png') {
            return res.status(400).json({ error: 'Wrong file type submitted.'});
        }
        // console.log(fieldname);
        // console.log(filename);
        // console.log(mimetype);

        const imageExtension = filename.split('.')[filename.split('.').length - 1];
        imageFileName = `${Math.round(Math.random()*1000000000000)}.${imageExtension}`;
        const filepath = path.join(os.tmpdir(), imageFileName);
        imageToBeUploaded = { filepath, mimetype}; 
        file.pipe(fs.createWriteStream(filepath));

    });
    busboy.on('finish', () => {
        admin.storage().bucket().upload(imageToBeUploaded.filepath, {
            resumable: false,
            metadata: {
                metadata: {
                    contentType: imageToBeUploaded.mimetype
                }
            }
        })
        .then(() => {
            const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
            return db.doc(`/users/${req.user.handle}`).update({ imageUrl});
        })
        .then(() => {
            return res.json({ message: 'Image uploaded successfully'});
        })
        .catch(err => {
            console.error(err);
            return res.status(500).json({ error: err.code });
        })
    });
    busboy.end(req.rawBody);

};

exports.markNotificationsRead = (req, res) => {
    let batch = db.batch();

    req.body.forEach(notificationId => {
        const notification = db.doc(`/notifications/${notificationId}`);
        batch.update(notification, {read: true});
    });
    batch.commit()
        .then(() => {
            return res.json({ message: 'Notifications marked read.'});
        })
        .catch(err => {
            console.error(err);
            return res.status(500).json({ error: err.code });
        });
}