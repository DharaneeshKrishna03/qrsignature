(async ()=> {
    const {decrypt} = require('./Utils/encDec');


    const secretKey = "lwo9kw8JiNAAQUUzU5Xewl+0HRZDj2WDjCeiDAbW7ydchbGX8N1aRIh1XjlWzCg6tU9ukv1Za1c3c3XFe2qOGA=="

    const decryptData = await decrypt(secretKey);

    console.log(decryptData);

})()