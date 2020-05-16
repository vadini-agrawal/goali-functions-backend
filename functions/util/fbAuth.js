const {admin, db} = require('./admin');
const { getNewToken } = require('../handlers/users');
const config = require('../util/config');

module.exports = (req, res, next) => {
    let idToken;
    if(req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        idToken = req.headers.authorization.split('Bearer ')[1];
        // console.log(idToken)
    } else {
        // console.log(req.headers);
        // console.log(req.headers.authorization);
        console.error('No token found');
        return res.status(403).json({ error: 'Unauthorized'});
    }

    // idToken = getNewToken();
    // req.headers.authorization = `Bearer ${idToken}`;

    admin.auth().verifyIdToken(idToken)
        .then(decodedToken => {
            req.user = decodedToken;
            // console.log(decodedToken);
            return db.collection('users')
            .where('userId', '==', req.user.uid)
            .limit(1)
            .get();
        })
        .then((data) => {
            req.user.handle = data.docs[0].data().handle;
            req.user.imageUrl = data.docs[0].data().imageUrl;
            return next();
        })
        .catch(err => {
            console.error('Error while verifying token', err);
            return res.status(403).json(err);
        });
}
