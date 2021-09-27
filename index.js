const express = require('express');
const bodyParser = require('body-parser');
const LoginContract = require('./login_contract.js');
const jwt = require('jsonwebtoken');
const cuid = require('cuid');
const cors = require('cors');

const loginContract = LoginContract.at('0x235dB3898Ba720bd4c448aF765c2cC041576ff8c');

// LoginAttempt is the name of the event that signals logins in the 
// Login contract. This is specified in the login.sol file.
const loginAttempt = loginContract.LoginAttempt();

const challenges = {};
const successfulLogins = {};

loginAttempt.watch((error, event) => {
    if(error) {
        console.log(error);
        return;
    }

    console.log(event);

    const sender = event.args.sender.toLowerCase();

    // If the challenge sent through Ethereum matches the one we generated,
    // mark the login attempt as valid, otherwise ignore it.
    if(challenges[sender] === event.args.challenge) {
        successfulLogins[sender] = true;
    }
});

// From here on its just express.js
const secret = "my super secret passcode";

const app = express();
// WARNING: CHANGE IN PRODUCTION
app.use(cors({
}))
app.use(bodyParser.json({ type: () => true }));

function validateJwt(req, res, next) {
    try {
        req.jwt = jwt.verify(req.body.jwt, secret, { 
            algorithms: ['HS256'] 
        });
        next();
    } catch(e) {
        res.sendStatus(401); //Unauthorized
    }
}

app.post('/login', (req, res) => {
    // All Ethereum addresses are 42 characters long
    if(!req.body.address || req.body.address.length !== 42) {
        res.sendStatus(400);
        return;
    }

    req.body.address = req.body.address.toLowerCase();

    const challenge = cuid();
    challenges[req.body.address] = challenge;

    const token = jwt.sign({ 
        address: req.body.address, 
        access: 'finishLogin'
    }, secret);

    res.json({
        challenge: challenge,
        jwt: token
    });
});

app.post('/finishLogin', validateJwt, (req, res) => {
    if(!req.jwt || !req.jwt.address || req.jwt.access !== 'finishLogin') {
        res.sendStatus(400);
        return;
    }

    if(successfulLogins[req.jwt.address]) {
        delete successfulLogins[req.jwt.address];
        delete challenges[req.jwt.address];

        const token = jwt.sign({ 
            address: req.jwt.address, 
            access: 'full'
        }, secret);

        res.json({
            jwt: token,
            address: req.jwt.address
        });
    } else {
        // HTTP Accepted (not completed)
        res.sendStatus(202);
    }
});

app.post('/apiTest', validateJwt, (req, res) => {
    if(req.jwt.access !== 'full') {
        res.sendStatus(401); //Unauthorized
        return;
    }

    res.json({
        message: 'It works!'
    });
});

app.listen(3000);