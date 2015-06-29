# Overview

What if customer feedback automatically drove business decisions?

Customer feedback contains invaluable insight into client satisfaction. Assistant Shop.r enables a department store to analyze aggregated customer feedback and consumer behavior in order to enable their buyers to make smarter purchasing decisions.

Now customer feedback can drive business decisions.  In this demo a video call (using Twilio) is held between the customer and customer service agent.  As the video call is happening IBM Watson Speech to Text service is transcribing the audio in real time.  After the video call is over the Alchemy Keywords and Sentiment API's are used to determine which product the customer was giving feedback on and then determines the sentiment of the customers feedback.  Once this is determined the Business Rules service in Bluemix is used to determine if the product has crossed a threshold requiring a buyer at the company to review the product.  The Workflow service in Bluemix is then used to decide whether or not to increase investment in the product or decrease investment in the product.

[![Youtube - App Overview](http://img.youtube.com/vi/EcOryuaGYCI/0.jpg)](http://www.youtube.com/watch?v=EcOryuaGYCI)
Video - http://img.youtube.com/vi/EcOryuaGYCI/0.jpg

[![Deploy to Bluemix](https://bluemix.net/deploy/button.png)](https://bluemix.net/deploy)

**Note:** If deploying by this method, the app will fail on first deploy. After this initial failure, you must complete steps [9-12](## Running the app on Bluemix) as described in the section [Running the app on Bluemix](## Running the app on Bluemix)  below for your app to start successfully.

[![Build Status](https://codeship.com/projects/5be9a2b0-f58e-0132-c56e-36e59e59a064/status?branch=master)](https://codeship.com/projects/5be9a2b0-f58e-0132-c56e-36e59e59a064/status?branch=master)

## How it Works

**Note:** This application requires two laptops to use it.  The person that is the customer service agent needs to be running on **Firefox 35**.  Later versions might work but they are not guranteed to work.  The person that is the customer can use **Chrome or Firefox**.

1. Have the first person open a web browser and goto [https://yourappurl/agent](https://yourappurl/agent), for example [https://assistant-shop-r.mybluemix.net/agent](https://assistant-shop-r.mybluemix.net/agent), remember Firefox...

2. Click "Go Online" at the top.

3. Have the second person open a web browser and goto [https://yourappurl](https://yourappurl), for example [https://assistant-shop-r.mybluemix.net/](https://assistant-shop-r.mybluemix.net/), remember Firefox or Chrome...

4. Click the camera icon for one of the products, you will get an alert asking for permission to your microphone and camera, agree and say yes.

5. The first person will then get an alert asking for permission to the microphone and camera, agree and say yes.

6. The second person should speak some text and it will be transcribed in real time for the first person (the agent).

7. One of the two people click "End call".

8. The first person, the agent, will see keywords extracted by the Alchemy API on the conversation and sentiment of the feedback.

9. Behind the scenes business rules and a workflow have been called to automatically generate a buying decision for our buyer.

10. Open a web browser and goto [https://yourappurl/tasks](https://yourappurl/tasks), for example [https://assistant-shop-r.mybluemix.net/tasks](https://assistant-shop-r.mybluemix.net/tasks).  You will see a task for the customers feedback.  Here you can either review or ignore the automated feedback, click one of the two links.

### Check out the app

[Customer View - https://assistant-shop-r.mybluemix.net](https://assistant-shop-r.mybluemix.net)

[Customer Service View - https://assistant-shop-r.mybluemix.net/agent](https://assistant-shop-r.mybluemix.net/agent)

[Buyer View - https://assistant-shop-r.mybluemix.net/tasks](https://assistant-shop-r.mybluemix.net/tasks)


### Architecture Diagram
<img src="https://raw.githubusercontent.com/IBM-Bluemix/assistant-shop.r/master/architecture-diagram.png" width="650px"><br>This an architectural overview of the systems that make this app run.<br>
